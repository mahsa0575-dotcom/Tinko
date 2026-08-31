/** Minimal i18n: Persian (default, RTL) + English (LTR). */
const dict = {
  fa: {
    // nav
    nav_main: 'اصلی', nav_ai: 'هوش مصنوعی', nav_community: 'انجمن', nav_system: 'سیستم',
    dashboard: 'داشبورد', groups: 'گروه‌ها', users: 'کاربران', providers: 'تأمین‌کنندگان AI',
    models: 'مدل‌ها و پروفایل‌ها', personalities: 'شخصیت‌ها', memory: 'حافظه',
    moderation: 'مدیریت و مدریشن', analytics: 'تحلیل‌ها', vps: 'سرور (VPS)',
    audit: 'گزارش‌ها و رخدادها', notifications: 'اعلان‌ها', health: 'سلامت سیستم', settings: 'تنظیمات',
    security: 'امنیت',
    // common
    search: 'جستجو…', search_placeholder: 'جستجو (Ctrl+K)', add: 'افزودن', save: 'ذخیره', cancel: 'انصراف',
    delete: 'حذف', edit: 'ویرایش', test: 'تست', refresh: 'بازخوانی', status: 'وضعیت', actions: 'عملیات',
    logout: 'خروج', loading: 'در حال بارگذاری…', confirm_delete: 'از حذف این مورد مطمئن هستید؟',
    no_data: 'موردی یافت نشد', theme: 'پوسته', language: 'زبان', dark: 'تیره', light: 'روشن', system: 'سیستم',
    saved: 'با موفقیت ذخیره شد', deleted: 'حذف شد', error: 'خطا',
    // dashboard
    total_groups: 'کل گروه‌ها', active_groups: 'گروه‌های فعال', total_users: 'کل کاربران',
    active_users: 'کاربران فعال', ai_requests: 'درخواست‌های AI', tokens: 'توکن‌ها',
    cost: 'هزینه تخمینی', avg_latency: 'میانگین تأخیر', messages_24h: 'پیام‌های ۲۴ ساعت',
    errors: 'خطاها', last_24h: 'در ۲۴ ساعت گذشته',
    // vps
    cpu: 'پردازنده', ram: 'حافظه', swap: 'سواپ', disk: 'دیسک', network: 'شبکه', load: 'بار سیستم',
    processes: 'پروسه‌ها', services: 'سرویس‌ها', server_info: 'اطلاعات سرور', uptime: 'مدت فعالیت',
    history: 'تاریخچه', live: 'زنده', unavailable: 'در دسترس نیست',
    // auth
    login_title: 'ورود به پنل مدیریت', login_tagline: 'برای ادامه وارد شوید', email: 'ایمیل', password: 'گذرواژه', login: 'ورود',
    login_failed: 'ورود ناموفق بود', role_admin: 'مدیر سیستم',
    totp_label: 'کد دو مرحله‌ای (TOTP یا کد بازیابی)',
  },
  en: {
    nav_main: 'Main', nav_ai: 'AI', nav_community: 'Community', nav_system: 'System',
    dashboard: 'Dashboard', groups: 'Groups', users: 'Users', providers: 'AI Providers',
    models: 'Models & Profiles', personalities: 'Personalities', memory: 'Memory',
    moderation: 'Moderation', analytics: 'Analytics', vps: 'VPS / Server',
    audit: 'Audit & Logs', notifications: 'Notifications', health: 'System Health', settings: 'Settings',
    security: 'Security',
    search: 'Search…', search_placeholder: 'Search (Ctrl+K)', add: 'Add', save: 'Save', cancel: 'Cancel',
    delete: 'Delete', edit: 'Edit', test: 'Test', refresh: 'Refresh', status: 'Status', actions: 'Actions',
    logout: 'Logout', loading: 'Loading…', confirm_delete: 'Are you sure you want to delete this?',
    no_data: 'No records found', theme: 'Theme', language: 'Language', dark: 'Dark', light: 'Light', system: 'System',
    saved: 'Saved successfully', deleted: 'Deleted', error: 'Error',
    total_groups: 'Total Groups', active_groups: 'Active Groups', total_users: 'Total Users',
    active_users: 'Active Users', ai_requests: 'AI Requests', tokens: 'Tokens',
    cost: 'Est. Cost', avg_latency: 'Avg Latency', messages_24h: 'Messages (24h)',
    errors: 'Errors', last_24h: 'in the last 24 hours',
    cpu: 'CPU', ram: 'RAM', swap: 'Swap', disk: 'Disk', network: 'Network', load: 'Load',
    processes: 'Processes', services: 'Services', server_info: 'Server Info', uptime: 'Uptime',
    history: 'History', live: 'Live', unavailable: 'Unavailable',
    login_title: 'Admin Panel Login', login_tagline: 'Sign in to continue', email: 'Email', password: 'Password', login: 'Sign in',
    login_failed: 'Login failed', role_admin: 'System Administrator',
    totp_label: 'Two-factor code (TOTP or recovery code)',
  },
};

let current = localStorage.getItem('botai_lang') || 'fa';

export function getLang() { return current; }
export function setLang(lang) {
  current = lang;
  localStorage.setItem('botai_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
}
export function t(key) { return dict[current]?.[key] ?? dict.fa[key] ?? key; }

// Persian number formatting helpers
export function fmtNum(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat(current === 'fa' ? 'fa-IR' : 'en-US').format(n);
}
export function fmtBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Number(bytes), i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}
export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(current === 'fa' ? 'fa-IR' : 'en-US');
}
