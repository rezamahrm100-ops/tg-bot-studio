import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import { useBots } from '../context/BotContext';

interface CoreModuleDescriptor {
  key: string;
  name: string;
  category: string;
  description: string;
  isEnabled: boolean;
}

/**
 * Safe fallback for modules added to the server before a bespoke React
 * editor is shipped. Presence, descriptions and status come from the server
 * registry; unknown configuration schemas are never guessed or modified.
 */
export default function LiveModuleFallbackPage({
  botId,
  moduleKey,
}: {
  botId: string;
  moduleKey: string;
}): React.ReactElement {
  const { i18n } = useTranslation();
  const fa = i18n.resolvedLanguage === 'fa';
  const navigate = useNavigate();
  const { refresh } = useBots();
  const [module, setModule] = useState<CoreModuleDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<CoreModuleDescriptor[]>(`/api/bots/${encodeURIComponent(botId)}/modules`)
      .then((modules) => {
        if (!cancelled) setModule(modules.find((item) => item.key === moduleKey) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setModule(null);
          setError(fa ? 'دریافت وضعیت ماژول ناموفق بود.' : 'Could not load the module.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [botId, moduleKey, reload, fa]);

  const saveToggle = async (): Promise<void> => {
    if (!module) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/bots/${encodeURIComponent(botId)}/modules/${encodeURIComponent(moduleKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ isEnabled: !module.isEnabled }),
      });
      setConfirm(false);
      setReload((value) => value + 1);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the module');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={700}>
          {module?.name ?? (fa ? 'ماژول هسته' : 'Core module')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {fa ? 'اطلاعات زنده از هسته TG Bot Studio' : 'Live from the TG Bot Studio engine'}
        </Typography>
      </Box>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
          <CircularProgress aria-label={fa ? 'در حال بارگذاری' : 'Loading'} />
        </Box>
      ) : !module ? (
        <Alert severity="info">
          {fa ? 'این ماژول در فهرست فعلی هسته وجود ندارد.' : 'This module is not in the current server catalog.'}
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                  {module.category}
                </Typography>
                <Chip
                  size="small"
                  color={module.isEnabled ? 'success' : 'default'}
                  variant="outlined"
                  label={module.isEnabled ? (fa ? 'فعال' : 'Enabled') : (fa ? 'غیرفعال' : 'Disabled')}
                />
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {module.description}
              </Typography>
              <Alert severity="info">
                {fa
                  ? 'این ماژول در هسته شناخته شده است، اما ویرایشگر اختصاصی آن هنوز در نسخهٔ فعلی رابط وجود ندارد. برای جلوگیری از تغییر ناامن تنظیمات ناشناخته، فقط مدیریت وضعیت در دسترس است.'
                  : 'The server recognizes this module, but no bespoke editor is installed. Only its enable/disable state can be changed safely until a supported editor ships.'}
              </Alert>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="contained" onClick={() => setConfirm(true)}>
                  {module.isEnabled
                    ? (fa ? 'غیرفعال‌کردن ماژول' : 'Disable module')
                    : (fa ? 'فعال‌کردن ماژول' : 'Enable module')}
                </Button>
                <Button variant="outlined" onClick={() => navigate(`/bots/${botId}/modules`)}>
                  {fa ? 'بازگشت به ماژول‌ها' : 'Back to modules'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Dialog open={confirm} onClose={busy ? undefined : () => setConfirm(false)} fullWidth maxWidth="xs">
        <DialogTitle>{fa ? 'تأیید تغییر' : 'Confirm change'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {fa
              ? `آیا وضعیت «${module?.name ?? ''}» تغییر کند؟ موتور ربات مجدداً بارگذاری می‌شود.`
              : `Change the state of "${module?.name ?? ''}"? The bot engine will reload.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(false)}>
            {fa ? 'انصراف' : 'Cancel'}
          </Button>
          <Button disabled={busy} variant="contained" onClick={() => void saveToggle()}>
            {busy ? (fa ? 'در حال ثبت…' : 'Saving…') : (fa ? 'تأیید' : 'Confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
