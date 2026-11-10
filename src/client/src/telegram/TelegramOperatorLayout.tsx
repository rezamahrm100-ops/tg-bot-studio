import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  MenuItem,
  FormControlLabel,
  Switch,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import StarOutlineIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { useTranslation } from 'react-i18next';
import { useBots } from '../context/BotContext';
import { apiFetch } from '../services/api';
import { localizedCategory, useLocalizedModules } from '../registry/localize';
import BotSimulatorDrawer from '../components/BotSimulatorDrawer';
import { getOperatorWebApp, telegramSelectionFeedback } from './operator-webapp';

interface OperatorPreferences {
  compactMode: boolean;
  favoriteModules: string[];
}

const DEFAULT_PREFERENCES: OperatorPreferences = {
  compactMode: false,
  favoriteModules: [],
};

function canFavoriteModule(key: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(key);
}

interface LiveModule {
  key: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
}

function backRoute(pathname: string): string {
  if (/^\/bots\/[^/]+\/m\//.test(pathname)) {
    return pathname.replace(/\/m\/[^/]+$/, '/modules');
  }
  if (/^\/bots\/[^/]+\/(modules|mini-apps|connections)\b/.test(pathname)) {
    return pathname.match(/^\/bots\/[^/]+/)?.[0] ?? '/';
  }
  return '/';
}

/**
 * Telegram-native navigation around the existing Studio route tree.
 * The source of truth remains BotsService and the module states endpoint:
 * no second configuration store, hard-coded module catalog or fake metrics.
 */
export default function TelegramOperatorLayout(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const fa = i18n.resolvedLanguage === 'fa';
  const navigate = useNavigate();
  const location = useLocation();
  const {
    bots,
    activeBot,
    setActiveBotId,
    loading: botsLoading,
    error: botsError,
    refresh,
  } = useBots();
  const localizedModules = useLocalizedModules();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [liveModules, setLiveModules] = useState<LiveModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preferences, setPreferences] = useState<OperatorPreferences>(DEFAULT_PREFERENCES);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesAvailable, setPreferencesAvailable] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const botId = activeBot?.id;

  useEffect(() => {
    // A route reached from a deep link or bot list must also select its bot
    // in the shared core context. Previously this only happened in desktop UI.
    const match = location.pathname.match(/^\/bots\/([^/]+)/);
    if (match?.[1] && bots.some((bot) => bot.id === match[1]) && activeBot?.id !== match[1]) {
      setActiveBotId(match[1]);
    }
  }, [location.pathname, bots, activeBot?.id, setActiveBotId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<OperatorPreferences>('/api/operator/preferences')
      .then((value) => {
        if (!cancelled) {
          setPreferences(value);
          setPreferencesAvailable(true);
          setPreferencesError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreferencesAvailable(false);
          setPreferencesError(
            fa
              ? 'تنظیمات شخصی بارگذاری نشد؛ نمای پیش‌فرض فعال است.'
              : 'Personal settings could not load; using the default view.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fa]);

  const savePreferences = async (next: OperatorPreferences): Promise<void> => {
    if (!preferencesAvailable || preferencesBusy) return;
    setPreferencesBusy(true);
    setPreferencesError(null);
    try {
      const updated = await apiFetch<OperatorPreferences>('/api/operator/preferences', {
        method: 'PUT',
        body: JSON.stringify(next),
      });
      setPreferences(updated);
    } catch {
      setPreferencesError(
        fa ? 'ذخیرهٔ تنظیمات شخصی ناموفق بود.' : 'Could not save personal settings.',
      );
    } finally {
      setPreferencesBusy(false);
    }
  };

  const toggleFavorite = (key: string): void => {
    if (!canFavoriteModule(key) || preferencesBusy || !preferencesAvailable) return;
    const favoriteModules = preferences.favoriteModules.includes(key)
      ? preferences.favoriteModules.filter((item) => item !== key)
      : [...preferences.favoriteModules, key];
    if (favoriteModules.length > 20) {
      setPreferencesError(
        fa ? 'حداکثر ۲۰ ماژول قابل نشان‌کردن است.' : 'Up to 20 favorites are supported.',
      );
      return;
    }
    telegramSelectionFeedback();
    void savePreferences({ ...preferences, favoriteModules });
  };

  useEffect(() => {
    // Keep the signed launch marker in the WebView URL even when the
    // existing Studio pages navigate without carrying query parameters.
    // A WebView reload then reinitializes the Telegram SDK and re-verifies
    // its initData with the server instead of falling back to desktop UI.
    const url = new URL(window.location.href);
    if (url.searchParams.get('tg_admin') !== '1') {
      url.searchParams.set('tg_admin', '1');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    // Keep status and module enablement in sync when the operator returns
    // from another Telegram screen or another administrator changes Studio.
    const refreshVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      refresh();
      setReloadKey((value) => value + 1);
    };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!botId) {
      setLiveModules([]);
      setModulesError(null);
      return;
    }
    let cancelled = false;
    setModulesLoading(true);
    setLiveModules([]);
    setModulesError(null);
    apiFetch<LiveModule[]>(`/api/bots/${encodeURIComponent(botId)}/modules`)
      .then((modules) => {
        if (!cancelled) setLiveModules(modules);
      })
      .catch(() => {
        if (!cancelled) {
          setLiveModules([]);
          setModulesError(fa ? 'دریافت ماژول‌ها ناموفق بود.' : 'Could not load modules.');
        }
      })
      .finally(() => {
        if (!cancelled) setModulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [botId, reloadKey, fa]);

  useEffect(() => {
    const backButton = getOperatorWebApp()?.BackButton;
    if (!backButton) return;
    if (location.pathname === '/') backButton.hide();
    else backButton.show();

    const handleBack = (): void => {
      telegramSelectionFeedback();
      navigate(backRoute(location.pathname));
    };
    backButton.onClick(handleBack);
    return () => backButton.offClick(handleBack);
  }, [location.pathname, navigate]);

  const moduleMeta = useMemo(
    () => new Map(localizedModules.map((item) => [item.key, item])),
    [localizedModules],
  );
  const nameByKey = useMemo(
    () => new Map(localizedModules.map((item) => [item.key, item.name])),
    [localizedModules],
  );

  const grouped = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const groups = new Map<string, LiveModule[]>();
    for (const module of liveModules) {
      const name = nameByKey.get(module.key) ?? module.name;
      if (
        query &&
        ![name, module.name, module.key, module.category, module.description]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      ) {
        continue;
      }
      const category = module.category || 'Other';
      groups.set(category, [...(groups.get(category) ?? []), module]);
    }
    return [...groups.entries()];
  }, [liveModules, search, nameByKey]);

  const favoriteModules = liveModules.filter((module) =>
    preferences.favoriteModules.includes(module.key),
  );

  const current = location.pathname;
  const activeNavigation =
    current === '/'
      ? 'home'
      : current.endsWith('/modules') || /\/m\//.test(current)
        ? 'modules'
        : current.endsWith('/mini-apps')
          ? 'apps'
          : current.startsWith('/bots/')
            ? 'bots'
            : 'more';

  const go = (path: string): void => {
    telegramSelectionFeedback();
    setDrawerOpen(false);
    navigate(path);
  };

  const refreshAll = (): void => {
    telegramSelectionFeedback();
    refresh();
    setReloadKey((value) => value + 1);
  };

  const modulePath = (key: string): string =>
    botId ? `/bots/${encodeURIComponent(botId)}/m/${encodeURIComponent(key)}` : '/';

  const title =
    current === '/'
      ? fa
        ? 'نمای کلی'
        : 'Overview'
      : current.endsWith('/modules') || /\/m\//.test(current)
        ? fa
          ? 'ماژول‌ها'
          : 'Modules'
        : current.endsWith('/mini-apps')
          ? fa
            ? 'مینی‌اپ‌ها'
            : 'Mini Apps'
          : current === '/security'
            ? fa
              ? 'امنیت'
              : 'Security'
            : (activeBot?.name ?? t('app.title'));

  return (
    <Box
      className="telegram-operator-shell"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'var(--tg-viewport-stable-height, 100dvh)',
        minHeight: 320,
        bgcolor: 'background.default',
        color: 'text.primary',
        overflow: 'hidden',
      }}
    >
      <Box
        component="header"
        sx={{ flexShrink: 0, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar
          disableGutters
          sx={{ minHeight: '56px !important', px: 1.5, display: 'flex', gap: 1 }}
        >
          <Box
            aria-hidden="true"
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
              color: 'primary.main',
            }}
          >
            <SmartToyOutlinedIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap sx={{ lineHeight: 1.35 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              TG Bot Studio · {botsLoading ? '…' : bots.length} {fa ? 'ربات' : 'bots'}
            </Typography>
          </Box>
          <IconButton
            aria-label={fa ? 'به‌روزرسانی داده‌ها' : 'Refresh data'}
            onClick={refreshAll}
            size="medium"
          >
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton
            aria-label={fa ? 'شخصی‌سازی رابط' : 'Personalize interface'}
            onClick={() => setSettingsOpen(true)}
          >
            <TuneOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton
            aria-label={fa ? 'جست‌وجو و منوی همه ماژول‌ها' : 'Search modules and options'}
            aria-expanded={drawerOpen}
            onClick={() => {
              telegramSelectionFeedback();
              setDrawerOpen(true);
              setReloadKey((value) => value + 1);
            }}
          >
            <MenuOutlinedIcon />
          </IconButton>
        </Toolbar>
        {activeBot && (
          <Box sx={{ px: 2, pb: 1.25, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Chip
              size="small"
              variant="outlined"
              color={activeBot.status === 'active' ? 'success' : 'default'}
              label={
                activeBot.status === 'active' ? (fa ? 'در حال اجرا' : 'Running') : activeBot.status
              }
              sx={{ height: 24, maxWidth: '50%' }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ flex: 1, textAlign: 'end' }}
            >
              {activeBot.name}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{
          flex: 1,
          overflowY: 'auto',
          overscrollBehaviorY: 'contain',
          width: '100%',
          px: { xs: 1.5, sm: 2.5 },
          pt: preferences.compactMode ? 1 : 2,
          pb: preferences.compactMode ? 1.5 : 3,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {botsError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {botsError}
          </Alert>
        )}
        <Outlet />
        <BotSimulatorDrawer />
      </Box>

      <Box
        component="nav"
        aria-label={fa ? 'ناوبری اصلی' : 'Main navigation'}
        sx={{
          flexShrink: 0,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
          boxShadow: '0 -2px 16px rgba(0,0,0,.04)',
        }}
      >
        <BottomNavigation
          showLabels
          value={activeNavigation}
          sx={{
            height: 64,
            bgcolor: 'transparent',
            '& .MuiBottomNavigationAction-root': { minWidth: 58, maxWidth: 'none', px: 0.5 },
            '& .MuiBottomNavigationAction-label': { fontSize: '0.72rem', mt: 0.25 },
            '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.72rem' },
          }}
        >
          <BottomNavigationAction
            value="home"
            label={fa ? 'خانه' : 'Home'}
            icon={<DashboardOutlinedIcon />}
            onClick={() => go('/')}
          />
          <BottomNavigationAction
            value="bots"
            label={fa ? 'ربات' : 'Bot'}
            icon={<SmartToyOutlinedIcon />}
            onClick={() => go(botId ? `/bots/${botId}` : '/')}
          />
          <BottomNavigationAction
            value="modules"
            label={fa ? 'ماژول‌ها' : 'Modules'}
            icon={<ExtensionOutlinedIcon />}
            onClick={() => go(botId ? `/bots/${botId}/modules` : '/')}
          />
          <BottomNavigationAction
            value="apps"
            label={fa ? 'مینی‌اپ' : 'Mini Apps'}
            icon={<AppsOutlinedIcon />}
            onClick={() => go(botId ? `/bots/${botId}/mini-apps` : '/')}
          />
        </BottomNavigation>
      </Box>

      <Drawer
        anchor={fa ? 'right' : 'left'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 'min(90vw, 380px)', bgcolor: 'background.paper' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', p: 2, gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {fa ? 'دسترسی سریع' : 'Quick access'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {fa ? 'همگام با ماژول‌های هسته' : 'Live from the Studio engine'}
            </Typography>
          </Box>
          <IconButton onClick={() => setDrawerOpen(false)} aria-label={fa ? 'بستن' : 'Close'}>
            <CloseOutlinedIcon />
          </IconButton>
        </Box>
        {bots.length > 1 && (
          <Box sx={{ px: 2, pb: 1.5 }}>
            <TextField
              select
              fullWidth
              size="small"
              label={fa ? 'ربات انتخاب‌شده' : 'Selected bot'}
              value={botId ?? ''}
              onChange={(event) => {
                const id = event.target.value;
                if (!bots.some((bot) => bot.id === id)) return;
                setActiveBotId(id);
                setSearch('');
                go(`/bots/${encodeURIComponent(id)}`);
              }}
            >
              {bots.map((bot) => (
                <MenuItem key={bot.id} value={bot.id}>
                  {bot.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}
        <Box sx={{ px: 2, pb: 1.5 }}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
            size="small"
            placeholder={fa ? 'جست‌وجو در ماژول‌ها…' : 'Search modules…'}
            aria-label={fa ? 'جست‌وجوی ماژول' : 'Search modules'}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        <Divider />
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {preferencesError && (
            <Alert severity="warning" sx={{ m: 2 }} role="status">
              {preferencesError}
            </Alert>
          )}
          {favoriteModules.length > 0 && !modulesLoading && !modulesError && !search.trim() && (
            <List dense disablePadding aria-label={fa ? 'ماژول‌های نشان‌شده' : 'Favorite modules'}>
              <ListSubheader sx={{ bgcolor: 'background.paper', fontWeight: 700 }}>
                {fa ? 'نشان‌شده‌ها' : 'Favorites'} · {favoriteModules.length}
              </ListSubheader>
              {favoriteModules.map((module) => (
                <ListItemButton key={module.key} onClick={() => go(modulePath(module.key))}>
                  <StarIcon color="warning" fontSize="small" sx={{ mr: 1 }} />
                  <ListItemText primary={nameByKey.get(module.key) ?? module.name} />
                </ListItemButton>
              ))}
              <Divider />
            </List>
          )}
          {!botId ? (
            <Alert severity="info" sx={{ m: 2 }}>
              {fa ? 'ابتدا یک ربات ایجاد یا انتخاب کنید.' : 'Create or select a bot first.'}
            </Alert>
          ) : modulesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={26} />
            </Box>
          ) : modulesError ? (
            <Alert
              severity="warning"
              sx={{ m: 2 }}
              action={<Button onClick={refreshAll}>{fa ? 'تلاش مجدد' : 'Retry'}</Button>}
            >
              {modulesError}
            </Alert>
          ) : grouped.length === 0 ? (
            <Typography color="text.secondary" variant="body2" sx={{ px: 2, py: 3 }}>
              {fa ? 'ماژولی با این جست‌وجو یافت نشد.' : 'No matching modules.'}
            </Typography>
          ) : (
            <List dense disablePadding>
              {grouped.map(([category, modules]) => (
                <React.Fragment key={category}>
                  <ListSubheader sx={{ bgcolor: 'background.paper', fontWeight: 700 }}>
                    {localizedCategory(t, category)} · {modules.length}
                  </ListSubheader>
                  {modules.map((module) => (
                    <Box
                      key={module.key}
                      sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
                    >
                      <ListItemButton
                        onClick={() => go(modulePath(module.key))}
                        sx={{
                          py: preferences.compactMode ? 0.5 : 1.1,
                          gap: 1,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <ListItemText
                          disableTypography
                          primary={
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                              {nameByKey.get(module.key) ?? module.name}
                            </Typography>
                          }
                          secondary={
                            <Typography
                              variant="caption"
                              noWrap
                              color="text.secondary"
                              sx={{ display: 'block' }}
                            >
                              {moduleMeta.get(module.key)?.description ?? module.description}
                            </Typography>
                          }
                        />
                        <Chip
                          size="small"
                          color={module.isEnabled ? 'success' : 'default'}
                          variant="outlined"
                          label={module.isEnabled ? (fa ? 'فعال' : 'On') : fa ? 'خاموش' : 'Off'}
                          sx={{ fontSize: '0.67rem', height: 22 }}
                        />
                      </ListItemButton>
                      {canFavoriteModule(module.key) && (
                        <IconButton
                          sx={{ mx: 0.5 }}
                          disabled={preferencesBusy || !preferencesAvailable}
                          aria-label={
                            (preferences.favoriteModules.includes(module.key)
                              ? fa
                                ? 'حذف از نشان‌شده‌ها'
                                : 'Remove favorite'
                              : fa
                                ? 'نشان‌کردن ماژول'
                                : 'Add favorite') +
                            ': ' +
                            (nameByKey.get(module.key) ?? module.name)
                          }
                          aria-pressed={preferences.favoriteModules.includes(module.key)}
                          onClick={() => toggleFavorite(module.key)}
                        >
                          {preferences.favoriteModules.includes(module.key) ? (
                            <StarIcon color="warning" fontSize="small" />
                          ) : (
                            <StarOutlineIcon fontSize="small" />
                          )}
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2 }}>
          <Button
            fullWidth
            size="medium"
            variant="outlined"
            startIcon={<ShieldOutlinedIcon />}
            onClick={() => go('/security')}
          >
            {fa ? 'امنیت' : 'Security'}
          </Button>
          <Button fullWidth variant="contained" onClick={() => go('/')}>
            {fa ? 'همه ربات‌ها' : 'All bots'}
          </Button>
        </Stack>
      </Drawer>
      <Dialog
        open={settingsOpen}
        onClose={() => !preferencesBusy && setSettingsOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="operator-personalization-title"
      >
        <DialogTitle id="operator-personalization-title">
          {fa ? 'شخصی‌سازی اختیاری' : 'Optional personalization'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {fa
                ? 'فقط چیدمان شخصی تغییر می‌کند؛ قابلیت‌ها و وضعیت ربات‌ها همیشه از هسته دریافت می‌شوند.'
                : 'Only your view changes. Capabilities and bot states always come from the core.'}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.compactMode}
                  disabled={preferencesBusy || !preferencesAvailable}
                  onChange={(event) =>
                    void savePreferences({ ...preferences, compactMode: event.target.checked })
                  }
                />
              }
              label={fa ? 'نمای فشرده' : 'Compact view'}
            />
            <Typography variant="caption" color="text.secondary">
              {fa
                ? 'برای نشان‌کردن هر ماژول، از ستارهٔ کنار آن در فهرست استفاده کنید. نشان‌شده‌ها بین ربات مدیریتی و مینی‌اپ همگام‌اند.'
                : 'Star a module in the module list. Favorites are shared between chat and the Mini App.'}
            </Typography>
            {preferencesError && <Alert severity="warning">{preferencesError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} disabled={preferencesBusy}>
            {fa ? 'بستن' : 'Close'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
