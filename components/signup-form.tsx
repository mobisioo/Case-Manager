"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, PanelsTopLeft, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import styles from "./auth-form.module.css";

type MessageState = {
  type: "success" | "error";
  text: string;
} | null;

function normalizeUsername(value: string) {
  return value
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isValidUsername(value: string) {
  return /^[\p{L}\p{N}_-]{3,32}$/u.test(value);
}

function getSignupErrorText(message?: string) {
  const text = (message || "").toLowerCase();

  if (text.includes("already registered") || text.includes("user already registered")) {
    return "با این ایمیل قبلاً حساب ساخته شده است.";
  }

  if (text.includes("password")) {
    return "رمز عبور قابل قبول نیست. رمز قوی‌تری وارد کنید.";
  }

  if (text.includes("email")) {
    return "ایمیل واردشده معتبر نیست.";
  }

  return "ثبت‌نام انجام نشد. اطلاعات را بررسی کنید و دوباره تلاش کنید.";
}

export default function SignupForm() {
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const cleanUsername = normalizeUsername(username);
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidUsername(cleanUsername)) {
      setMessage({ type: "error", text: "نام کاربری باید ۳ تا ۳۲ کاراکتر باشد و فاصله نداشته باشد." });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: "error", text: "رمز عبور باید حداقل ۶ کاراکتر باشد." });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "تکرار رمز عبور با رمز عبور یکسان نیست." });
      return;
    }

    setLoading(true);

    const { data: existingEmail, error: usernameCheckError } = await supabase.rpc("get_email_by_username", {
      input_username: cleanUsername
    });

    if (usernameCheckError) {
      setLoading(false);
      setMessage({ type: "error", text: "بررسی نام کاربری انجام نشد. فایل SQL جدید را در Supabase اجرا کنید." });
      return;
    }

    if (existingEmail) {
      setLoading(false);
      setMessage({ type: "error", text: "این نام کاربری قبلاً ثبت شده است." });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          username: cleanUsername
        }
      }
    });

    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: getSignupErrorText(error.message) });
      return;
    }

    if (data.session) {
      window.location.href = "/dashboard";
      return;
    }

    setMessage({
      type: "success",
      text: "ثبت‌نام انجام شد. اگر تأیید ایمیل فعال باشد، لینک تأیید برای شما ارسال می‌شود."
    });
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-label="ثبت‌نام در سامانه">
        <aside className={styles.brandSide}>
          <div className={styles.textureLayer} />
          <div className={styles.brandContent}>
            <div className={styles.logoBox} aria-hidden="true">
              <PanelsTopLeft size={38} strokeWidth={1.45} />
            </div>
            <h1>شروع فضای کاری</h1>
            <span className={styles.brandLine} />
            <p>یک حساب بسازید و بعد از این با نام کاربری وارد شوید.</p>
          </div>
        </aside>

        <section className={styles.formSide}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h2>ثبت‌نام</h2>
              <p>اطلاعات حساب خود را وارد کنید.</p>
            </div>

            <form className={styles.form} onSubmit={handleSignup}>
              <label className={styles.fieldLabel} htmlFor="fullName">
                نام نمایشی
              </label>
              <div className={styles.inputWrap}>
                <UserRound size={20} strokeWidth={1.65} />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="نام و نام خانوادگی"
                  autoComplete="name"
                  required
                />
              </div>

              <label className={styles.fieldLabel} htmlFor="username">
                نام کاربری
              </label>
              <div className={styles.inputWrap}>
                <UserRound size={20} strokeWidth={1.65} />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="مثلاً کاربر_۰۱"
                  autoComplete="username"
                  required
                />
              </div>
              <p className={styles.compactNote}>نام کاربری می‌تواند فارسی، عدد یا زیرخط باشد و نباید فاصله داشته باشد.</p>

              <label className={styles.fieldLabel} htmlFor="email">
                ایمیل
              </label>
              <div className={styles.inputWrap}>
                <Mail size={20} strokeWidth={1.65} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ایمیل"
                  autoComplete="email"
                  required
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
                  placeholder="حداقل ۶ کاراکتر"
                  autoComplete="new-password"
                  required
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

              <label className={styles.fieldLabel} htmlFor="confirmPassword">
                تکرار رمز عبور
              </label>
              <div className={styles.inputWrap}>
                <Lock size={20} strokeWidth={1.65} />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="تکرار رمز عبور"
                  autoComplete="new-password"
                  required
                />
              </div>

              {message && (
                <p className={`${styles.message} ${message.type === "error" ? styles.error : styles.success}`}>
                  {message.text}
                </p>
              )}

              <button className={styles.primaryButton} type="submit" disabled={loading}>
                {loading ? "در حال ثبت‌نام..." : "ثبت‌نام"}
              </button>
            </form>

            <p className={styles.signupText}>
              قبلاً حساب ساخته‌اید؟ <Link href="/">وارد شوید</Link>
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
