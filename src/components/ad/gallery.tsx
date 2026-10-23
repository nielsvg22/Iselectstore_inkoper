"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { hiRes } from "@/lib/images";

export function Gallery({ images, demo }: { images: string[]; demo: boolean }) {
  const [i, setI] = React.useState(0);
  if (!images.length) return <div className="flex aspect-[16/10] items-center justify-center rounded-2xl bg-muted-bg text-sm text-muted">Geen foto&apos;s beschikbaar</div>;
  return (
    <div className="min-w-0 max-w-full">
      <div className="relative overflow-hidden rounded-2xl bg-muted-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hiRes(images[i], "full")} alt={`Foto ${i + 1} van ${images.length}`} className="aspect-[4/3] w-full object-contain" referrerPolicy="no-referrer" />
        {demo && <span className="absolute left-3 top-3 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning backdrop-blur">Voorbeelddata</span>}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
          {images.map((src, k) => (
            <button key={src + k} type="button" onClick={() => setI(k)} aria-label={`Toon foto ${k + 1}`} aria-pressed={k === i} className={cn("h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition", k === i ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hiRes(src, "thumb")} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
