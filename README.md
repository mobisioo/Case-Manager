# Case Manager v17

نسخه اصلاح‌شده پس از v16:

- صفحه اصلی دوباره درست نمایش داده می‌شود.
- عنوان «خانه» از نوار بالایی حذف شد.
- سایدبار درختی فقط در بخش مدیریت پرونده‌ها نمایش داده می‌شود.
- پروفایل کاربر به سایدبار آیکونی سمت راست منتقل شد.
- منوی پروفایل شامل «تغییر رمز» و «خروج» است.
- تغییر تب‌ها و بخش‌ها انیمیشن نرم دارد.

## اجرا

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --legacy-peer-deps
npm run dev
```
