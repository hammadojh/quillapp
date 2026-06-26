import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const STORAGE_KEY = "quill.lang";

type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = {
  ar: {
    "brand": "كويل",
    "nav.signin": "تسجيل الدخول",
    "nav.signout": "تسجيل الخروج",
    "landing.tag": "للخبراء الذين لا يجدون وقتاً للكتابة",
    "landing.title.1": "خبرتك،",
    "landing.title.2": "مكتوبة.",
    "landing.subtitle":
      "يحاورك كويل عمّا تعرفه — ثم يكتب مقالاً مصقولاً يمكنك نشره أو مشاركته على وسائل التواصل. صوتك نفسه. دون التحديق في صفحة فارغة.",
    "landing.cta.start": "ابدأ الكتابة مجاناً",
    "landing.cta.how": "كيف يعمل",
    "landing.step1.title": "أخبرنا بما تعرف",
    "landing.step1.body": "يسألك كويل أسئلة مركّزة عن موضوعك، جمهورك، والرؤية الفريدة التي ستشاركها وحدك.",
    "landing.step2.title": "نكتب المقال نيابةً عنك",
    "landing.step2.body": "مقال من 700–1100 كلمة بصوتك، بأمثلتك، بصيغة Markdown نظيفة — جاهز للتحرير.",
    "landing.step3.title": "شاركه أينما أردت",
    "landing.step3.body": "انسخه إلى مدونتك أو لينكدإن أو نشرتك. سندرج لك أيضاً عبارة مختصرة للنشر.",
    "landing.footer.tag": "اكتب أكثر مما تعرف.",
    "auth.welcome.signin": "أهلاً بعودتك.",
    "auth.welcome.signup": "هيا لنجعلك تكتب.",
    "auth.sub.signin": "سجّل الدخول لمتابعة العمل على مسوداتك.",
    "auth.sub.signup": "أنشئ حساباً لحفظ مقالاتك.",
    "auth.google": "المتابعة عبر جوجل",
    "auth.or": "أو",
    "auth.email": "البريد الإلكتروني",
    "auth.password": "كلمة المرور",
    "auth.signin": "تسجيل الدخول",
    "auth.create": "إنشاء حساب",
    "auth.new": "جديد هنا؟",
    "auth.have": "لديك حساب بالفعل؟",
    "dash.title": "مقالاتك",
    "dash.subtitle": "مسودات، مقابلات قيد التنفيذ، وقطع منتهية.",
    "dash.new": "مقال جديد",
    "dash.empty.title": "أخبر العالم بما تعرف.",
    "dash.empty.body": "اضغط «مقال جديد» لبدء المقابلة.",
    "dash.status.generated": "تم التوليد",
    "dash.status.progress": "مقابلة قيد التنفيذ",
    "dash.updated": "آخر تحديث {time}",
    "post.back": "مقالاتك",
    "post.delete": "حذف",
    "post.delete.confirm": "حذف هذا المقال؟",
    "post.interview.label": "مقابلة",
    "post.interview.title": "أخبرني عن موضوعك",
    "post.voice": "صوت",
    "post.generate": "توليد المقال",
    "post.generating": "جارٍ الكتابة…",
    "post.intro": "أخبرني بما تريد تعليمه للعالم اليوم.",
    "post.thinking": "أفكّر…",
    "post.placeholder": "اكتب إجابتك…",
    "post.send": "إرسال",
    "post.voice.listening": "أستمع — اضغط للإيقاف",
    "post.voice.idle": "اضغط على المايكروفون وأجب بصوتك",
    "post.voice.transcribing": "جارٍ النسخ…",
    "post.voice.thinking": "كويل يفكّر…",
    "post.copy.md": "نسخ كـ Markdown",
    "post.edit": "تعديل",
    "post.preview": "معاينة",
    "post.save": "حفظ التغييرات",
    "post.tweak.title": "عدّل المسودة",
    "post.tweak.hint": "مثل «اجعله أكثر حدة»، «أضف مقدمة أقوى»، «اختصره إلى 500 كلمة».",
    "post.tweak.placeholder": "ملاحظاتك…",
    "post.tweak.rewrite": "إعادة الكتابة",
    "post.tweak.rewriting": "جارٍ إعادة الكتابة…",
    "share.title": "الآن شارك ما كتبته.",
    "share.body": "خبرتك لا تنفع إلا من يراها. انشرها حيث يتواجد جمهورك — لا تستغرق 30 ثانية.",
    "share.x": "نشر على X",
    "share.li": "مشاركة على لينكدإن",
    "share.copy": "نسخ العبارة الاجتماعية",
    "share.copied": "تم النسخ — الصقها في لينكدإن",
    "toast.copied.md": "تم النسخ كـ Markdown",
    "toast.saved": "تم الحفظ",
    "toast.ready": "مقالك جاهز",
    "toast.rewritten": "تمت إعادة الكتابة",
    "lang.toggle": "English",
  },
  en: {
    "brand": "Quill",
    "nav.signin": "Sign in",
    "nav.signout": "Sign out",
    "landing.tag": "For experts who don't have time to write",
    "landing.title.1": "Your expertise,",
    "landing.title.2": "written down.",
    "landing.subtitle":
      "Quill interviews you about what you know — then writes a polished long-form blog post you can publish or share on social media. Same voice. None of the staring at a blank page.",
    "landing.cta.start": "Start writing free",
    "landing.cta.how": "How it works",
    "landing.step1.title": "Tell us what you know",
    "landing.step1.body":
      "Quill asks you focused questions about your topic, your audience, and the one insight only you would share.",
    "landing.step2.title": "We draft the article",
    "landing.step2.body":
      "A 700–1,100 word post in your voice, with your examples, in clean markdown — ready to edit.",
    "landing.step3.title": "Share it anywhere",
    "landing.step3.body":
      "Copy to your blog, LinkedIn, or newsletter. We even include a one-line social blurb.",
    "landing.footer.tag": "Write more of what you know.",
    "auth.welcome.signin": "Welcome back.",
    "auth.welcome.signup": "Let's get you writing.",
    "auth.sub.signin": "Sign in to keep working on your drafts.",
    "auth.sub.signup": "Create an account to save your posts.",
    "auth.google": "Continue with Google",
    "auth.or": "or",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signin": "Sign in",
    "auth.create": "Create account",
    "auth.new": "New here?",
    "auth.have": "Already have an account?",
    "dash.title": "Your posts",
    "dash.subtitle": "Drafts, interviews-in-progress, and finished pieces.",
    "dash.new": "New post",
    "dash.empty.title": "Tell the world what you know.",
    "dash.empty.body": "Click New post to start an interview.",
    "dash.status.generated": "Generated",
    "dash.status.progress": "Interview in progress",
    "dash.updated": "Updated {time}",
    "post.back": "Your posts",
    "post.delete": "Delete",
    "post.delete.confirm": "Delete this post?",
    "post.interview.label": "Interview",
    "post.interview.title": "Tell me about your topic",
    "post.voice": "Voice",
    "post.generate": "Generate post",
    "post.generating": "Writing…",
    "post.intro": "Tell me what you want to teach the world today.",
    "post.thinking": "Thinking…",
    "post.placeholder": "Type your answer…",
    "post.send": "Send",
    "post.voice.listening": "Listening — tap to stop",
    "post.voice.idle": "Tap the mic and answer out loud",
    "post.voice.transcribing": "Transcribing…",
    "post.voice.thinking": "Quill is thinking…",
    "post.copy.md": "Copy markdown",
    "post.edit": "Edit",
    "post.preview": "Preview",
    "post.save": "Save changes",
    "post.tweak.title": "Tweak the draft",
    "post.tweak.hint": 'e.g. "make it punchier", "add a stronger intro", "cut to 500 words".',
    "post.tweak.placeholder": "Your feedback…",
    "post.tweak.rewrite": "Rewrite",
    "post.tweak.rewriting": "Rewriting…",
    "share.title": "Now share what you wrote.",
    "share.body":
      "Your expertise only helps people who see it. Post it where your audience lives — it takes 30 seconds.",
    "share.x": "Post on X",
    "share.li": "Share on LinkedIn",
    "share.copy": "Copy social blurb",
    "share.copied": "Copied — paste into LinkedIn",
    "toast.copied.md": "Copied as markdown",
    "toast.saved": "Saved",
    "toast.ready": "Your post is ready",
    "toast.rewritten": "Rewritten",
    "lang.toggle": "العربية",
  },
};

type Ctx = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const LangContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  };

  const t = (key: string, vars?: Record<string, string>) => {
    let s = dicts[lang][key] ?? dicts.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };

  const value: Ctx = {
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    setLang,
    toggle: () => setLang(lang === "ar" ? "en" : "ar"),
    t,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { toggle, t } = useT();
  return (
    <button
      onClick={toggle}
      className={`rounded-full border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/5 ${className}`}
      aria-label="Toggle language"
    >
      {t("lang.toggle")}
    </button>
  );
}