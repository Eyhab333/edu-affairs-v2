export const metadata = {
  title: "المنصة قيد الصيانة | مدار",
  description: "صفحة الصيانة المؤقتة لمنصة مدار.",
};

export default function MaintenancePage() {
  return (
    <main className="relative isolate flex min-h-screen overflow-hidden bg-[#07111f] px-5 py-8 text-right text-slate-100 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_20%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_88%_82%,rgba(14,116,144,0.20),transparent_32%),linear-gradient(135deg,#07111f_0%,#0b1728_52%,#07111f_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-28 top-12 -z-10 size-72 rounded-full border border-teal-300/10 bg-teal-300/[0.03] sm:size-96"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-24 -z-10 size-80 rounded-full border border-cyan-200/10 bg-cyan-200/[0.025] sm:size-[28rem]"
      />

      <section className="m-auto w-full max-w-2xl">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/35 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
          <div className="flex items-center justify-center gap-3 text-teal-200">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-teal-200/20 bg-teal-300/10 text-lg font-black">
              م
            </span>
            <span className="text-xl font-bold tracking-tight">مدار</span>
          </div>

          <div className="mx-auto mt-10 flex size-24 items-center justify-center rounded-[1.75rem] border border-teal-200/20 bg-gradient-to-br from-teal-300/20 to-cyan-300/10 text-teal-100 shadow-lg shadow-teal-950/30">
            <svg
              aria-hidden="true"
              className="size-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.7 6.3-2.1 2.1m-5.93 7.31a3 3 0 0 1-4.242-4.242l5.122-5.122a3 3 0 0 1 4.242 4.243l-.71.71m6.25-2.52a3 3 0 0 1 4.243 4.243l-5.122 5.121a3 3 0 0 1-4.243-4.242l.71-.71M9 15l6-6"
              />
              <path
                strokeLinecap="round"
                d="M5.5 18.5 3 21m15.5-15.5L21 3"
              />
            </svg>
          </div>

          <div className="mx-auto mt-8 max-w-xl text-center">
            <p className="text-sm font-semibold tracking-wide text-teal-200/90">
              منصة مدار
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-relaxed text-white sm:text-4xl">
              المنصة قيد الصيانة حاليًا
            </h1>
            <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
              نعمل على استعادة خدمات المنصة لتعود إليكم بأفضل صورة ممكنة.
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-400 sm:text-base">
              نعتذر عن هذا التوقف المؤقت، ونشكركم على تفهمكم.
            </p>
          </div>

          <div className="mt-10 border-t border-white/10 pt-5 text-center text-sm text-slate-400">
            منصة مدار – تكوين المعرفة التعليمية
          </div>
        </div>
      </section>
    </main>
  );
}
