"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, PanelsTopLeft } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import styles from "./auth-form.module.css";

type MessageState = {
  type: "success" | "error";
  text: string;
} | null;

function isEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function normalizeIdentifier(value: string) {
  return value
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function getLoginErrorText(message?: string) {
  const text = (message || "").toLowerCase();

  if (text.includes("email not confirmed")) {
    return "ایمیل حساب هنوز تأیید نشده است. ابتدا ایمیل تأیید را بررسی کنید.";
  }

  if (text.includes("invalid login credentials")) {
    return "نام کاربری، ایمیل یا رمز عبور درست نیست.";
  }

  if (text.includes("too many")) {
    return "تعداد تلاش‌ها زیاد شده است. چند دقیقه بعد دوباره امتحان کنید.";
  }

  return "ورود انجام نشد. اطلاعات حساب را بررسی کنید و دوباره تلاش کنید.";
}

export default function LoginForm() {
  const supabase = useMemo(() => createClient(), []);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  async function resolveEmail(value: string) {
    const cleaned = normalizeIdentifier(value);

    if (!cleaned) {
      throw new Error("شناسه ورود را وارد کنید.");
    }

    if (isEmail(cleaned)) {
      return cleaned;
    }

    const { data, error } = await supabase.rpc("get_email_by_username", {
      input_username: cleaned
    });

    if (error) {
      if (error.message?.toLowerCase().includes("function") || error.code === "PGRST202") {
        throw new Error("تنظیمات دیتابیس کامل اجرا نشده است. فایل SQL جدید را دوباره در Supabase اجرا کنید.");
      }

      throw new Error("بررسی نام کاربری انجام نشد. دوباره تلاش کنید.");
    }

    if (!data) {
      throw new Error("نام کاربری پیدا نشد یا حساب غیرفعال است.");
    }

    return data as string;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!identifier.trim()) {
      setMessage({ type: "error", text: "نام کاربری یا ایمیل را وارد کنید." });
      return;
    }

    if (!password) {
      setMessage({ type: "error", text: "رمز عبور را وارد کنید." });
      return;
    }

    setLoading(true);

    try {
      const email = await resolveEmail(identifier);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setMessage({ type: "error", text: getLoginErrorText(error.message) });
        return;
      }

      setMessage({ type: "success", text: "ورود با موفقیت انجام شد." });
      window.location.href = "/dashboard";
    } catch (error) {
      const text = error instanceof Error ? error.message : "ورود انجام نشد. دوباره تلاش کنید.";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setMessage(null);
    setLoading(true);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`
      }
    });

    if (error) {
      setLoading(false);
      setMessage({ type: "error", text: "ورود با حساب گوگل انجام نشد. تنظیمات ارائه‌دهنده گوگل را در Supabase بررسی کنید." });
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-label="ورود به سامانه">
        <aside className={styles.brandSide}>
          <div className={styles.textureLayer} />
          <div className={styles.brandContent}>
            <div className={styles.logoBox} aria-hidden="true">
              <PanelsTopLeft size={38} strokeWidth={1.45} />
            </div>
            <h1>سامانه مدیریت پرونده</h1>
            <span className={styles.brandLine} />
            <p>دسترسی امن، ساده و منظم به فضای کاری شما</p>
          </div>
        </aside>

        <section className={styles.formSide}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h2>ورود به حساب</h2>
              <p>با نام کاربری، ایمیل یا حساب گوگل وارد شوید.</p>
            </div>

            <form className={styles.form} onSubmit={handleLogin} noValidate>
              <label className={styles.fieldLabel} htmlFor="identifier">
                نام کاربری یا ایمیل
              </label>
              <div className={styles.inputWrap}>
                <Mail size={20} strokeWidth={1.65} />
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="نام کاربری یا ایمیل"
                  autoComplete="username"
                />
              </div>

              <label className={styles.fieldLabel} htmlFor="password">
                رمز عبور
              </label>
              <div className={styles.inputWrap}>
                <Lock size={20} strokeWidth={1.65} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="رمز عبور"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <div className={styles.optionsRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>مرا به خاطر بسپار</span>
                </label>
                <button type="button" className={styles.linkButton}>
                  فراموشی رمز عبور
                </button>
              </div>

              {message && (
                <p className={`${styles.message} ${message.type === "error" ? styles.error : styles.success}`}>
                  {message.text}
                </p>
              )}

              <button className={styles.primaryButton} type="submit" disabled={loading}>
                {loading ? "در حال ورود..." : "ورود"}
              </button>
            </form>

            <div className={styles.divider}>
              <span />
              <b>یا</b>
              <span />
            </div>

            <button className={styles.googleButton} onClick={handleGoogleLogin} type="button" disabled={loading}>
              <span className={styles.googleMark}>◎</span>
              ورود با حساب گوگل
            </button>

            <p className={styles.signupText}>
              حساب ندارید؟ <Link href="/signup">ثبت‌نام کنید</Link>
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
