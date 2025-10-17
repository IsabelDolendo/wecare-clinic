"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Tip = {
  title: string;
  description: string;
  image: string;
  alt: string;
};

const SWIPE_THRESHOLD = 50;

type TipsCarouselProps = {
  tips: Tip[];
};

export default function TipsCarousel({ tips }: TipsCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const hasTips = tips.length > 0;

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % tips.length);
  }, [tips.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + tips.length) % tips.length);
  }, [tips.length]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches[0]?.clientX ?? null;
    if (startX != null && endX != null) {
      const delta = startX - endX;
      if (Math.abs(delta) > SWIPE_THRESHOLD) {
        if (delta > 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    }
    touchStartXRef.current = null;
  };

  useEffect(() => {
    if (!hasTips || tips.length <= 1) return;
    const timer = window.setInterval(() => {
      goNext();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [goNext, hasTips, tips.length]);

  if (!hasTips) {
    return null;
  }

  const activeTip = tips[activeIndex];

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Bite Care Tips</h3>
          <p className="text-sm text-neutral-600">
            Follow these quick reminders to stay safe after an animal bite incident.
          </p>
        </div>
        <div className="hidden sm:flex gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Next
          </button>
        </div>
      </div>

      <div
        className="relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartXRef.current = null;
        }}
      >
        <article
          className="rounded-lg border bg-white/90 p-3 shadow-sm transition-all duration-500"
          style={{
            animation: "slideIn 0.45s ease both",
          }}
        >
          <div className="overflow-hidden rounded-md border">
            <Image
              src={activeTip.image}
              alt={activeTip.alt}
              width={600}
              height={400}
              className="h-auto w-full"
              priority
            />
          </div>
          <h4 className="mt-3 text-base font-semibold text-neutral-900">{activeTip.title}</h4>
          <p className="text-sm text-neutral-600">{activeTip.description}</p>
        </article>
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-16 bg-gradient-to-r from-white/90 to-transparent sm:block" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-white/90 to-transparent sm:block" aria-hidden="true" />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Bite care tips">
        {tips.map((tip, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={tip.title}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`bite-tip-panel-${index}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#800000]/40 ${
                isActive ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              {tip.title}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500 sm:hidden">
        <button
          type="button"
          onClick={goPrev}
          className="rounded-md border border-neutral-300 px-3 py-1 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Prev
        </button>
        <span>
          {activeIndex + 1} of {tips.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="rounded-md border border-neutral-300 px-3 py-1 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Next
        </button>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </section>
  );
}
