"use client";

type TakweenLoaderProps = {
  label?: string;
  sublabel?: string;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function TakweenLoader({
  label = "جاري التحميل...",
  sublabel,
  className,
}: TakweenLoaderProps) {
  return (
    <div className={cx("takween-loader", className)} dir="rtl">
      <div className="takween-loader__mark" aria-hidden="true">
        <div className="takween-loader__book">
          <span className="takween-loader__page takween-loader__page--1" />
          <span className="takween-loader__page takween-loader__page--2" />
          <span className="takween-loader__page takween-loader__page--3" />
          <span className="takween-loader__page takween-loader__page--4" />
        </div>

        <div className="takween-loader__word">
          <span className="takween-loader__word-base">تكوين</span>

          <span className="takween-loader__segment takween-loader__segment--1">
            تكوين
          </span>
          <span className="takween-loader__segment takween-loader__segment--2">
            تكوين
          </span>
          <span className="takween-loader__segment takween-loader__segment--3">
            تكوين
          </span>
          <span className="takween-loader__segment takween-loader__segment--4">
            تكوين
          </span>
        </div>
      </div>

      <div className="takween-loader__text">
        <div className="takween-loader__label">{label}</div>
        {sublabel ? (
          <div className="takween-loader__sublabel">{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
}

export function FullScreenTakweenLoader({
  label = "جاري تجهيز مساحتك...",
  sublabel = "لحظات قليلة",
  className,
}: TakweenLoaderProps) {
  return (
    <div
      className={cx(
        "min-h-screen w-full bg-background text-foreground flex items-center justify-center px-6",
        className
      )}
    >
      <TakweenLoader label={label} sublabel={sublabel} />
    </div>
  );
}