import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { BotsService } from '../bots/bots.service';
import { PrismaService } from '../database/prisma.service';
import { allowedOperatorIds, operatorWebAppUrl } from './operator-access';
import { buttonLabel, categoryCounts, getPage } from './operator-view';
import { OperatorPreferencesService, validFavoriteModuleKey } from './operator-preferences';

type ActionType =
  | 'home'
  | 'bots'
  | 'status'
  | 'bot'
  | 'categories'
  | 'modules'
  | 'module'
  | 'preview-toggle'
  | 'confirm-toggle'
  | 'favorites'
  | 'favorite-toggle';

interface OperatorAction {
  type: ActionType;
  ownerId: number;
  expires: number;
  botId?: string;
  moduleKey?: string;
  category?: string;
  expected?: boolean;
  page?: number;
}

/**
 * Private native Telegram interface for the existing Studio server.
 * Every screen is rebuilt from the live BotsService; the chat is for safe
 * quick actions, while the Mini App hosts the entire existing dashboard.
 */
@Injectable()
export class OperatorClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperatorClientService.name);
  private bot?: Bot;
  private readonly callbacks = new Map<string, OperatorAction>();

  constructor(
    private readonly bots: BotsService,
    private readonly prisma: PrismaService,
    private readonly preferences: OperatorPreferencesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = process.env.ADMIN_CLIENT_BOT_TOKEN?.trim();
    const allowed = allowedOperatorIds(process.env.ADMIN_CLIENT_USER_IDS);
    if (!token && allowed.size === 0) return;
    if (!token || allowed.size === 0) {
      this.logger.warn(
        'Operator bot disabled: both ADMIN_CLIENT_BOT_TOKEN and ADMIN_CLIENT_USER_IDS are required',
      );
      return;
    }

    const existing = await this.prisma.bot.findFirst({ where: { token }, select: { id: true } });
    if (existing) {
      this.logger.error(
        'Operator bot token belongs to a managed bot: use a separate BotFather token',
      );
      return;
    }

    const bot = new Bot(token);
    this.bot = bot;
    bot.catch((error) => this.logger.error('Operator update failed: ' + error.message));
    bot.use(async (ctx, next) => {
      // Private, allowlisted operators only. No data is sent to public chats.
      if (ctx.chat?.type !== 'private' || !ctx.from || !allowed.has(ctx.from.id)) return;
      await next();
    });

    bot.command('start', (ctx) => this.home(ctx));
    bot.command('help', (ctx) => this.home(ctx));
    bot.command('panel', (ctx) => this.home(ctx));
    bot.command('bots', (ctx) => this.showBots(ctx, 0));
    bot.command('status', (ctx) => this.showStatus(ctx));
    bot.command('favorites', (ctx) => this.showFavorites(ctx));
    bot.callbackQuery(/^op:[A-Za-z0-9_-]+$/, (ctx) => this.handleCallback(ctx));

    try {
      await bot.init();
      await bot.api.setMyCommands([
        { command: 'start', description: 'منوی مدیریت' },
        { command: 'bots', description: 'فهرست زنده ربات‌ها' },
        { command: 'status', description: 'وضعیت و آمار زنده' },
        { command: 'favorites', description: 'ماژول‌های نشان‌شده' },
        { command: 'panel', description: 'داشبورد کامل' },
        { command: 'help', description: 'راهنما' },
      ]);
      const url = operatorWebAppUrl();
      if (url) {
        // Bot API private-chat menu button is scoped per authorized user;
        // unapproved visitors never receive a dashboard launch shortcut.
        await Promise.all(
          [...allowed].map((id) =>
            bot.api
              .setChatMenuButton({
                chat_id: id,
                menu_button: { type: 'web_app', text: 'داشبورد', web_app: { url } },
              })
              .catch((error: unknown) => {
                this.logger.warn(
                  'Could not set operator menu button: ' +
                    (error instanceof Error ? error.message : String(error)),
                );
              }),
          ),
        );
      } else {
        this.logger.warn('Operator Mini App requires public HTTPS APP_URL');
      }
      void bot
        .start({ onStart: () => this.logger.log('Telegram operator interface is running') })
        .catch((error: unknown) =>
          this.logger.error(
            'Operator polling stopped: ' + (error instanceof Error ? error.message : String(error)),
          ),
        );
    } catch (error) {
      this.bot = undefined;
      this.logger.error(
        'Cannot start Telegram operator: ' +
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
        'Operator shutdown error: ' + (error instanceof Error ? error.message : String(error)),
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
      if (this.callbacks.size > 1500) this.callbacks.clear();
    }
    const nonce = randomBytes(9).toString('base64url');
    this.callbacks.set(nonce, { ...action, ownerId, expires: now + 15 * 60_000 });
    return 'op:' + nonce;
  }

  private mainKeyboard(ownerId: number): InlineKeyboard {
    const keyboard = new InlineKeyboard()
      .text('ربات‌ها', this.callback(ownerId, { type: 'bots', page: 0 }))
      .text('وضعیت', this.callback(ownerId, { type: 'status' }))
      .row()
      .text('علاقه‌مندی‌ها', this.callback(ownerId, { type: 'favorites' }));
    const app = operatorWebAppUrl();
    if (app) keyboard.row().webApp('بازکردن داشبورد کامل', app);
    return keyboard;
  }

  /** Edit menus in place, never send a new chat message for an unchanged state. */
  private async respond(ctx: Context, text: string, keyboard: InlineKeyboard): Promise<void> {
    if (ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, { reply_markup: keyboard });
        return;
      } catch (error) {
        if (error instanceof Error && /message is not modified/i.test(error.message)) return;
        // Old/inaccessible messages can be replaced with one fresh reply.
      }
    }
    await ctx.reply(text, { reply_markup: keyboard });
  }

  private async home(ctx: Context): Promise<void> {
    // Telegram creates a private chat only after /start. Configure the native
    // menu button again at that moment if registration before /start failed.
    const webAppUrl = operatorWebAppUrl();
    if (webAppUrl && ctx.chat?.type === 'private') {
      await ctx.api
        .setChatMenuButton({
          chat_id: ctx.chat.id,
          menu_button: { type: 'web_app', text: 'داشبورد', web_app: { url: webAppUrl } },
        })
        .catch(() => undefined);
    }
    const all = await this.bots.findAll();
    const running = all.filter((bot) => bot.status === 'active').length;
    await this.respond(
      ctx,
      [
        'TG Bot Studio | مدیریت یکپارچه',
        '',
        `ربات‌های متصل: ${all.length}`,
        `در حال اجرا: ${running}`,
        '',
        'از دکمه‌های زیر استفاده کنید. تمام تنظیمات پیشرفته در داشبورد کامل در دسترس هستند.',
      ].join('\n'),
      this.mainKeyboard(ctx.from!.id),
    );
  }

  private async showBots(ctx: Context, page = 0): Promise<void> {
    const ownerId = ctx.from!.id;
    const all = await this.bots.findAll();
    const size = 7;
    const { current, pages } = getPage(all.length, page, size);
    const keyboard = new InlineKeyboard();
    for (const bot of all.slice(current * size, (current + 1) * size)) {
      keyboard
        .text(
          (bot.status === 'active' ? 'فعال' : 'خاموش') + ' | ' + buttonLabel(bot.name, 30),
          this.callback(ownerId, { type: 'bot', botId: bot.id }),
        )
        .row();
    }
    if (current > 0) {
      keyboard.text('صفحه قبل', this.callback(ownerId, { type: 'bots', page: current - 1 }));
    }
    if (current < pages - 1) {
      keyboard.text('صفحه بعد', this.callback(ownerId, { type: 'bots', page: current + 1 }));
    }
    keyboard
      .row()
      .text('تازه‌سازی', this.callback(ownerId, { type: 'bots', page: current }))
      .text('خانه', this.callback(ownerId, { type: 'home' }));
    await this.respond(
      ctx,
      `ربات‌های TG Bot Studio: ${all.length}\nصفحه ${current + 1} از ${pages}\n\n` +
        (all.length
          ? 'برای جزئیات و ماژول‌ها یک ربات را انتخاب کنید.'
          : 'رباتی ثبت نشده است. از داشبورد کامل ربات بسازید.'),
      keyboard,
    );
  }

  /** Favorites are an owner-specific view of the same live server catalog. */
  private async showFavorites(ctx: Context, botId?: string, page = 0): Promise<void> {
    const ownerId = ctx.from!.id;
    const settings = await this.preferences.get(ownerId);
    if (!botId) {
      const all = await this.bots.findAll();
      const { current, pages } = getPage(all.length, page, 7);
      const keyboard = new InlineKeyboard();
      for (const bot of all.slice(current * 7, (current + 1) * 7)) {
        keyboard
          .text(buttonLabel(bot.name, 35), this.callback(ownerId, {
            type: 'favorites', botId: bot.id, page: 0,
          }))
          .row();
      }
      if (current > 0) keyboard.text('قبلی', this.callback(ownerId, { type: 'favorites', page: current - 1 }));
      if (current < pages - 1) keyboard.text('بعدی', this.callback(ownerId, { type: 'favorites', page: current + 1 }));
      keyboard.row().text('خانه', this.callback(ownerId, { type: 'home' }));
      await this.respond(
        ctx,
        settings.favoriteModules.length
          ? 'علاقه‌مندی‌های شخصی شما\\nیک ربات را انتخاب کنید. فقط ماژول‌های موجود در هسته نمایش داده می‌شوند.'
          : 'هنوز ماژولی نشان نکرده‌اید. از جزئیات هر ماژول می‌توانید آن را به علاقه‌مندی‌ها اضافه کنید.',
        keyboard,
      );
      return;
    }
    const bot = await this.bots.findOne(botId);
    const modules = (await this.bots.listModules(botId)).filter(
      (item) => settings.favoriteModules.includes(String(item.key)),
    );
    const { current, pages } = getPage(modules.length, page, 7);
    const keyboard = new InlineKeyboard();
    for (const module of modules.slice(current * 7, (current + 1) * 7)) {
      keyboard.text(buttonLabel(module.name, 35), this.callback(ownerId, {
        type: 'module', botId, moduleKey: String(module.key),
      })).row();
    }
    if (current > 0) keyboard.text('قبلی', this.callback(ownerId, { type: 'favorites', botId, page: current - 1 }));
    if (current < pages - 1) keyboard.text('بعدی', this.callback(ownerId, { type: 'favorites', botId, page: current + 1 }));
    keyboard.row().text('انتخاب ربات', this.callback(ownerId, { type: 'favorites' }));
    await this.respond(
      ctx,
      'علاقه‌مندی‌های «' + buttonLabel(bot.name, 50) + '»\\n' +
        (modules.length ? 'برای مدیریت ماژول، آن را انتخاب کنید.' : 'ماژول نشان‌شده‌ای در این ربات وجود ندارد.'),
      keyboard,
    );
  }

  private async showStatus(ctx: Context): Promise<void> {
    const all = await this.bots.findAll();
    const active = all.filter((bot) => bot.status === 'active').length;
    const subscribers = all.reduce((count, bot) => count + bot.subscribers, 0);
    const volume = all.reduce((count, bot) => count + bot.dailyVolume, 0);
    const lines = [
      'وضعیت زنده استودیو',
      '',
      `ربات‌ها: ${all.length}`,
      `ربات‌های فعال: ${active}`,
      `ماژول‌های فعال: ${all.reduce((count, bot) => count + bot.activeModules, 0)}`,
      `مینی‌اپ‌ها: ${all.reduce((count, bot) => count + bot.miniApps, 0)}`,
      `کاربران در همه ربات‌ها (مجموع): ${subscribers}`,
      `پیام‌های ثبت‌شده امروز: ${volume}`,
      '',
      'برای داده‌های دقیق هر ربات و گزارش‌های پیشرفته وارد داشبورد شوید.',
    ];
    await this.respond(ctx, lines.join('\n'), this.mainKeyboard(ctx.from!.id));
  }

  private async showBot(ctx: Context, botId: string): Promise<void> {
    const item = await this.bots.findOne(botId);
    const ownerId = ctx.from!.id;
    const keyboard = new InlineKeyboard()
      .text('ماژول‌ها', this.callback(ownerId, { type: 'categories', botId, page: 0 }))
      .row()
      .text('فهرست ربات‌ها', this.callback(ownerId, { type: 'bots', page: 0 }));
    const url = operatorWebAppUrl();
    if (url) {
      keyboard
        .row()
        .webApp(
          'تنظیمات و گزارش‌های کامل',
          new URL(`/bots/${encodeURIComponent(botId)}?tg_admin=1`, url).toString(),
        );
    }
    await this.respond(
      ctx,
      [
        'جزئیات ربات',
        '',
        buttonLabel(item.name, 80),
        item.username ? '@' + item.username : '',
        `وضعیت: ${item.status}`,
        `ماژول‌های فعال: ${item.activeModules}`,
        `مینی‌اپ‌ها: ${item.miniApps}`,
        `کاربران: ${item.subscribers}`,
        `پیام‌های امروز: ${item.dailyVolume}`,
      ]
        .filter(Boolean)
        .join('\n'),
      keyboard,
    );
  }

  private async showCategories(ctx: Context, botId: string, page = 0): Promise<void> {
    const modules = await this.bots.listModules(botId);
    const categories = categoryCounts(modules);
    const size = 8;
    const { current, pages } = getPage(categories.length, page, size);
    const ownerId = ctx.from!.id;
    const keyboard = new InlineKeyboard()
      .text(
        `همه ماژول‌ها (${modules.length})`,
        this.callback(ownerId, { type: 'modules', botId, page: 0 }),
      )
      .row();
    for (const counts of categories.slice(current * size, (current + 1) * size)) {
      const category = counts.name;
      keyboard
        .text(
          `${buttonLabel(category, 22)} · ${counts.enabled}/${counts.count}`,
          this.callback(ownerId, { type: 'modules', botId, category, page: 0 }),
        )
        .row();
    }
    if (current > 0) {
      keyboard.text(
        'قبلی',
        this.callback(ownerId, { type: 'categories', botId, page: current - 1 }),
      );
    }
    if (current < pages - 1) {
      keyboard.text(
        'بعدی',
        this.callback(ownerId, { type: 'categories', botId, page: current + 1 }),
      );
    }
    keyboard.row().text('بازگشت به ربات', this.callback(ownerId, { type: 'bot', botId }));
    await this.respond(
      ctx,
      `دسته‌های ماژول‌ها\n${modules.length} ماژول از هسته دریافت شد\n\n` +
        'دسته‌ای را برای مشاهده ماژول‌ها انتخاب کنید. اعداد، تعداد فعال به کل هستند.',
      keyboard,
    );
  }

  private async showModules(
    ctx: Context,
    botId: string,
    page = 0,
    category?: string,
  ): Promise<void> {
    const bot = await this.bots.findOne(botId);
    const all = await this.bots.listModules(botId);
    const modules = category
      ? all.filter((module) => String(module.category || 'Other') === category)
      : all;
    const size = 7;
    const { current, pages } = getPage(modules.length, page, size);
    const ownerId = ctx.from!.id;
    const keyboard = new InlineKeyboard();
    for (const module of modules.slice(current * size, (current + 1) * size)) {
      keyboard
        .text(
          (module.isEnabled ? 'فعال' : 'خاموش') + ' | ' + buttonLabel(module.name),
          this.callback(ownerId, {
            type: 'module',
            botId,
            moduleKey: String(module.key),
            page: current,
            category,
          }),
        )
        .row();
    }
    if (current > 0) {
      keyboard.text(
        'قبلی',
        this.callback(ownerId, { type: 'modules', botId, page: current - 1, category }),
      );
    }
    if (current < pages - 1) {
      keyboard.text(
        'بعدی',
        this.callback(ownerId, { type: 'modules', botId, page: current + 1, category }),
      );
    }
    keyboard.row().text('دسته‌ها', this.callback(ownerId, { type: 'categories', botId, page: 0 }));
    await this.respond(
      ctx,
      `ماژول‌های «${buttonLabel(bot.name, 45)}»\n${category ? category + '\n' : ''}صفحه ${current + 1} از ${pages}\n\n` +
        (modules.length
          ? 'برای نمایش توضیحات و تنظیمات هر ماژول آن را انتخاب کنید.'
          : 'ماژولی در این دسته وجود ندارد.'),
      keyboard,
    );
  }

  private async showModule(ctx: Context, action: OperatorAction): Promise<void> {
    const { botId, moduleKey, page, category } = action;
    if (!botId || !moduleKey) return;
    const modules = await this.bots.listModules(botId);
    const module = modules.find((item) => item.key === moduleKey);
    if (!module) {
      await this.showModules(ctx, botId, page, category);
      return;
    }
    const ownerId = ctx.from!.id;
    const favorite = (await this.preferences.get(ownerId)).favoriteModules.includes(moduleKey);
    const keyboard = new InlineKeyboard()
      .text(
        module.isEnabled ? 'غیرفعال‌کردن' : 'فعال‌کردن',
        this.callback(ownerId, {
          type: 'preview-toggle',
          botId,
          moduleKey,
          expected: Boolean(module.isEnabled),
          page,
          category,
        }),
      )
      .row();
    if (validFavoriteModuleKey(moduleKey)) {
      keyboard.text(
        favorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها',
        this.callback(ownerId, { type: 'favorite-toggle', botId, moduleKey, page, category }),
      ).row();
    }
    keyboard.text('بازگشت به فهرست', this.callback(ownerId, { type: 'modules', botId, page, category }));
    const url = operatorWebAppUrl();
    if (url) {
      keyboard
        .row()
        .webApp(
          'تنظیمات پیشرفته در مینی‌اپ',
          new URL(
            `/bots/${encodeURIComponent(botId)}/m/${encodeURIComponent(moduleKey)}?tg_admin=1`,
            url,
          ).toString(),
        );
    }
    await this.respond(
      ctx,
      [
        buttonLabel(module.name, 80),
        '',
        `وضعیت: ${module.isEnabled ? 'فعال' : 'غیرفعال'}`,
        `دسته: ${buttonLabel(module.category, 55)}`,
        '',
        buttonLabel(module.description, 380),
        '',
        'تنظیم دقیق پیکربندی در داشبورد انجام می‌شود.',
      ].join('\n'),
      keyboard,
    );
  }

  private async previewToggle(ctx: Context, action: OperatorAction): Promise<void> {
    const { botId, moduleKey, expected } = action;
    if (!botId || !moduleKey || expected === undefined) return;
    const modules = await this.bots.listModules(botId);
    const module = modules.find((item) => item.key === moduleKey);
    if (!module || Boolean(module.isEnabled) !== expected) {
      await ctx.reply('وضعیت تغییر کرده است؛ از منوی ربات دوباره بررسی کنید.');
      return;
    }
    const ownerId = ctx.from!.id;
    const keyboard = new InlineKeyboard()
      .text('تأیید تغییر', this.callback(ownerId, { ...action, type: 'confirm-toggle' }))
      .row()
      .text('انصراف', this.callback(ownerId, { ...action, type: 'module' }));
    await this.respond(
      ctx,
      `تأیید تغییر ماژول\n\n«${buttonLabel(module.name, 80)}» ${expected ? 'غیرفعال' : 'فعال'} شود؟\n\n` +
        'این اقدام موتور ربات را مجدداً بارگذاری می‌کند.',
      keyboard,
    );
  }

  private async confirmToggle(ctx: Context, action: OperatorAction): Promise<void> {
    const { botId, moduleKey, expected } = action;
    if (!botId || !moduleKey || expected === undefined) return;
    const modules = await this.bots.listModules(botId);
    const module = modules.find((item) => item.key === moduleKey);
    if (!module || Boolean(module.isEnabled) !== expected) {
      await ctx.reply('وضعیت قبلاً تغییر کرده است؛ دوباره بررسی کنید.');
      return;
    }
    await this.bots.updateModule(botId, moduleKey, { isEnabled: !expected });
    await this.showModule(ctx, action);
  }

  private async handleCallback(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data ?? '';
    const key = data.startsWith('op:') ? data.slice(3) : '';
    const action = this.callbacks.get(key);
    if (!action || action.ownerId !== ctx.from!.id || action.expires < Date.now()) {
      await ctx.answerCallbackQuery({
        text: 'دکمه منقضی شده است؛ دوباره /start را بزنید.',
        show_alert: true,
      });
      return;
    }
    if (action.type === 'confirm-toggle' || action.type === 'favorite-toggle') this.callbacks.delete(key);
    // Telegram requires a timely callback answer; the data fetch can then run.
    await ctx.answerCallbackQuery();
    try {
      switch (action.type) {
        case 'home':
          await this.home(ctx);
          break;
        case 'bots':
          await this.showBots(ctx, action.page);
          break;
        case 'status':
          await this.showStatus(ctx);
          break;
        case 'favorites':
          await this.showFavorites(ctx, action.botId, action.page);
          break;
        case 'favorite-toggle':
          if (action.botId && action.moduleKey) {
            const modules = await this.bots.listModules(action.botId);
            if (modules.some((module) => module.key === action.moduleKey)) {
              await this.preferences.toggleFavorite(ctx.from!.id, action.moduleKey);
            }
            await this.showModule(ctx, action);
          }
          break;
        case 'bot':
          if (action.botId) await this.showBot(ctx, action.botId);
          break;
        case 'categories':
          if (action.botId) await this.showCategories(ctx, action.botId, action.page);
          break;
        case 'modules':
          if (action.botId) await this.showModules(ctx, action.botId, action.page, action.category);
          break;
        case 'module':
          await this.showModule(ctx, action);
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
      await ctx.reply('عملیات انجام نشد. دوباره تلاش کنید یا داشبورد کامل را باز کنید.');
    }
  }
}
