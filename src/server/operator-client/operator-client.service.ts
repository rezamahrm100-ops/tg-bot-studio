import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { BotsService } from '../bots/bots.service';
import { PrismaService } from '../database/prisma.service';
import { allowedOperatorIds, operatorWebAppUrl } from './operator-access';

type ActionType =
  'home' | 'bots' | 'status' | 'bot' | 'modules' | 'preview-toggle' | 'confirm-toggle';
interface OperatorAction {
  type: ActionType;
  ownerId: number;
  expires: number;
  botId?: string;
  moduleKey?: string;
  expected?: boolean;
  page?: number;
}

/**
 * A dedicated private-chat operator bot, running inside the existing Studio
 * process and using the same BotsService / database as the web dashboard.
 * Only lightweight workflows live in chat; the existing complete dashboard
 * is launched as an authenticated WebApp for full configuration parity.
 */
@Injectable()
export class OperatorClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperatorClientService.name);
  private bot?: Bot;
  private readonly callbacks = new Map<string, OperatorAction>();

  constructor(
    private readonly bots: BotsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = process.env.ADMIN_CLIENT_BOT_TOKEN?.trim();
    const allowed = allowedOperatorIds(process.env.ADMIN_CLIENT_USER_IDS);
    if (!token && allowed.size === 0) return; // Safe opt-in.
    if (!token || allowed.size === 0) {
      this.logger.warn(
        'Operator bot disabled: configure both ADMIN_CLIENT_BOT_TOKEN and ADMIN_CLIENT_USER_IDS',
      );
      return;
    }

    // Never run two getUpdates pollers against the same token.
    const existing = await this.prisma.bot.findFirst({ where: { token }, select: { id: true } });
    if (existing) {
      this.logger.error(
        'Operator bot token matches a managed Studio bot; configure a separate BotFather token',
      );
      return;
    }

    const bot = new Bot(token);
    this.bot = bot;
    bot.catch((error) => this.logger.error('Operator bot update failed: ' + error.message));

    // No response, keyboard or data is exposed to unapproved users or groups.
    bot.use(async (ctx, next) => {
      if (ctx.chat?.type !== 'private' || !ctx.from || !allowed.has(ctx.from.id)) return;
      await next();
    });

    bot.command('start', (ctx) => this.home(ctx));
    bot.command('help', (ctx) => this.home(ctx));
    bot.command('bots', (ctx) => this.showBots(ctx));
    bot.command('status', (ctx) => this.showStatus(ctx));
    bot.command('panel', (ctx) => this.home(ctx));
    bot.callbackQuery(/^op:[A-Za-z0-9_-]+$/, (ctx) => this.handleCallback(ctx));

    try {
      await bot.init();
      await bot.api.setMyCommands([
        { command: 'start', description: 'پنل مدیریت' },
        { command: 'bots', description: 'فهرست ربات‌ها' },
        { command: 'status', description: 'وضعیت سرویس‌ها' },
        { command: 'panel', description: 'بازکردن داشبورد کامل' },
      ]);
      if (!operatorWebAppUrl()) {
        this.logger.warn('Operator dashboard button disabled: APP_URL must be public HTTPS');
      }
      void bot
        .start({
          onStart: () => this.logger.log('Private Telegram operator client is running'),
        })
        .catch((error: unknown) => {
          this.logger.error(
            'Operator polling stopped: ' + (error instanceof Error ? error.message : String(error)),
          );
        });
    } catch (error) {
      this.bot = undefined;
      this.logger.error(
        'Cannot start Telegram operator client: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.bot) return;
    try {
      if (this.bot.isRunning()) await this.bot.stop();
    } catch (error) {
      this.logger.warn(
        'Operator bot shutdown: ' + (error instanceof Error ? error.message : String(error)),
      );
    }
    this.bot = undefined;
  }

  private callback(ownerId: number, action: Omit<OperatorAction, 'ownerId' | 'expires'>): string {
    const now = Date.now();
    if (this.callbacks.size > 1500) {
      for (const [key, entry] of this.callbacks) {
        if (entry.expires < now) this.callbacks.delete(key);
      }
      // Keep the cache bounded even when many active menu buttons exist.
      if (this.callbacks.size > 1500) this.callbacks.clear();
    }
    const nonce = randomBytes(9).toString('base64url');
    this.callbacks.set(nonce, { ...action, ownerId, expires: now + 15 * 60_000 });
    return 'op:' + nonce;
  }

  private mainKeyboard(ownerId: number): InlineKeyboard {
    const keyboard = new InlineKeyboard()
      .text('ربات‌ها', this.callback(ownerId, { type: 'bots' }))
      .text('وضعیت', this.callback(ownerId, { type: 'status' }));
    const webApp = operatorWebAppUrl();
    if (webApp) keyboard.row().webApp('داشبورد کامل', webApp);
    return keyboard;
  }

  private async respond(ctx: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
    if (ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, { reply_markup: keyboard });
        return;
      } catch {
        // An unchanged/expired message is harmless; issue a fresh one instead.
      }
    }
    await ctx.reply(text, { reply_markup: keyboard });
  }

  private async home(ctx: Context): Promise<void> {
    const owner = ctx.from!.id;
    await this.respond(
      ctx,
      'مدیریت یکپارچه TG Bot Studio\n\n' +
        'از دکمه‌ها برای عملیات سریع استفاده کنید. داشبورد کامل، تمام بخش‌های وب را در خود تلگرام باز می‌کند.\n\n' +
        '/bots — فهرست ربات‌ها\n/status — وضعیت اجرا\n/panel — داشبورد',
      this.mainKeyboard(owner),
    );
  }

  private async showBots(ctx: Context): Promise<void> {
    const owner = ctx.from!.id;
    const bots = await this.bots.findAll();
    const keyboard = new InlineKeyboard();
    for (const item of bots.slice(0, 30)) {
      keyboard
        .text(
          (item.is_active ? '● ' : '○ ') + item.name.slice(0, 28),
          this.callback(owner, { type: 'bot', botId: item.id }),
        )
        .row();
    }
    keyboard.text('منوی اصلی', this.callback(owner, { type: 'home' }));
    await this.respond(
      ctx,
      'ربات‌های متصل: ' +
        bots.length +
        '\n' +
        (bots.length ? 'برای مشاهده و تنظیم هر ربات انتخاب کنید.' : 'هنوز رباتی ثبت نشده است.') +
        (bots.length > 30 ? '\n۳۰ مورد اول نمایش داده شده‌اند؛ فهرست کامل در داشبورد است.' : ''),
      keyboard,
    );
  }

  private async showStatus(ctx: Context): Promise<void> {
    const owner = ctx.from!.id;
    const bots = await this.bots.findAll();
    const running = bots.filter((item) => item.status === 'active').length;
    const totalUsers = bots.reduce((sum, item) => sum + item.subscribers, 0);
    const lines = [
      'وضعیت TG Bot Studio',
      '',
      'تعداد ربات‌ها: ' + bots.length,
      'ربات‌های در حال اجرا: ' + running,
      'کاربران ثبت‌شده در ربات‌ها (تجمیعی): ' + totalUsers,
      '',
      ...bots.slice(0, 15).map((item) => item.name.slice(0, 38) + ': ' + item.status),
    ];
    await this.respond(ctx, lines.join('\n'), this.mainKeyboard(owner));
  }

  private async showBot(ctx: Context, botId: string): Promise<void> {
    const owner = ctx.from!.id;
    const item = await this.bots.findOne(botId);
    const keyboard = new InlineKeyboard()
      .text('ماژول‌ها', this.callback(owner, { type: 'modules', botId, page: 0 }))
      .row()
      .text('فهرست ربات‌ها', this.callback(owner, { type: 'bots' }));
    const url = operatorWebAppUrl();
    if (url)
      keyboard
        .row()
        .webApp(
          'تنظیمات کامل',
          new URL('/bots/' + encodeURIComponent(botId) + '?tg_admin=1', url).toString(),
        );
    await this.respond(
      ctx,
      [
        'ربات: ' + item.name,
        item.username ? '@' + item.username : '',
        'وضعیت: ' + item.status,
        'ماژول‌های فعال: ' + item.activeModules,
        'کاربران: ' + item.subscribers,
        'حجم پیام امروز: ' + item.dailyVolume,
      ]
        .filter(Boolean)
        .join('\n'),
      keyboard,
    );
  }

  private async showModules(ctx: Context, botId: string, page: number): Promise<void> {
    const owner = ctx.from!.id;
    const bot = await this.bots.findOne(botId);
    const modules = await this.bots.listModules(botId);
    const pageSize = 7;
    const maxPage = Math.max(0, Math.ceil(modules.length / pageSize) - 1);
    const currentPage = Math.max(0, Math.min(page, maxPage));
    const keyboard = new InlineKeyboard();
    for (const module of modules.slice(currentPage * pageSize, (currentPage + 1) * pageSize)) {
      keyboard
        .text(
          (module.isEnabled ? '● ' : '○ ') + String(module.name).slice(0, 38),
          this.callback(owner, {
            type: 'preview-toggle',
            botId,
            moduleKey: String(module.key),
            expected: Boolean(module.isEnabled),
            page: currentPage,
          }),
        )
        .row();
    }
    if (currentPage > 0)
      keyboard.text(
        'قبلی',
        this.callback(owner, { type: 'modules', botId, page: currentPage - 1 }),
      );
    if (currentPage < maxPage)
      keyboard.text(
        'بعدی',
        this.callback(owner, { type: 'modules', botId, page: currentPage + 1 }),
      );
    keyboard.row().text('بازگشت به ربات', this.callback(owner, { type: 'bot', botId }));
    await this.respond(
      ctx,
      'ماژول‌های ' +
        bot.name +
        '\nصفحه ' +
        (currentPage + 1) +
        ' از ' +
        (maxPage + 1) +
        '\n● فعال | ○ غیرفعال\nبرای تغییر وضعیت یک ماژول آن را انتخاب کنید.',
      keyboard,
    );
  }

  private async previewToggle(ctx: Context, action: OperatorAction): Promise<void> {
    const { botId, moduleKey, expected, page } = action;
    if (!botId || !moduleKey || expected === undefined) return;
    const modules = await this.bots.listModules(botId);
    const module = modules.find((item) => item.key === moduleKey);
    if (!module || Boolean(module.isEnabled) !== expected) {
      await ctx.reply('وضعیت تغییر کرده است. فهرست را مجدداً باز کنید.');
      return;
    }
    const keyboard = new InlineKeyboard()
      .text(
        'تأیید تغییر',
        this.callback(ctx.from!.id, { type: 'confirm-toggle', botId, moduleKey, expected, page }),
      )
      .row()
      .text('انصراف', this.callback(ctx.from!.id, { type: 'modules', botId, page }));
    await this.respond(
      ctx,
      'آیا ماژول «' +
        module.name +
        '» ' +
        (expected ? 'غیرفعال' : 'فعال') +
        ' شود؟\n' +
        'این تغییر موتور ربات را مجدداً بارگذاری می‌کند.',
      keyboard,
    );
  }

  private async confirmToggle(ctx: Context, action: OperatorAction): Promise<void> {
    const { botId, moduleKey, expected } = action;
    if (!botId || !moduleKey || expected === undefined) return;
    const modules = await this.bots.listModules(botId);
    const module = modules.find((item) => item.key === moduleKey);
    if (!module || Boolean(module.isEnabled) !== expected) {
      await ctx.reply('وضعیت ماژول قبلاً تغییر کرده است. دوباره بررسی کنید.');
      return;
    }
    await this.bots.updateModule(botId, moduleKey, { isEnabled: !expected });
    await this.showModules(ctx, botId, action.page ?? 0);
  }

  private async handleCallback(ctx: Context): Promise<void> {
    const raw = ctx.callbackQuery?.data ?? '';
    const key = raw.startsWith('op:') ? raw.slice(3) : '';
    const action = this.callbacks.get(key);
    if (!action || action.ownerId !== ctx.from!.id || action.expires < Date.now()) {
      await ctx.answerCallbackQuery({
        text: 'این دکمه منقضی شده است؛ /start را بزنید.',
        show_alert: true,
      });
      return;
    }
    if (action.type === 'confirm-toggle') this.callbacks.delete(key); // Single-use dangerous action.
    await ctx.answerCallbackQuery();
    try {
      switch (action.type) {
        case 'home':
          await this.home(ctx);
          break;
        case 'bots':
          await this.showBots(ctx);
          break;
        case 'status':
          await this.showStatus(ctx);
          break;
        case 'bot':
          if (action.botId) await this.showBot(ctx, action.botId);
          break;
        case 'modules':
          if (action.botId) await this.showModules(ctx, action.botId, action.page ?? 0);
          break;
        case 'preview-toggle':
          await this.previewToggle(ctx, action);
          break;
        case 'confirm-toggle':
          await this.confirmToggle(ctx, action);
          break;
      }
    } catch (error) {
      this.logger.warn(
        'Operator action failed: ' + (error instanceof Error ? error.message : String(error)),
      );
      await ctx.reply('انجام عملیات ممکن نشد. دوباره تلاش کنید یا داشبورد را باز کنید.');
    }
  }
}
