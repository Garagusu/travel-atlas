import { TileGridMark } from "@/components/tile-grid-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 grid lg:grid-cols-[1.1fr_1fr] min-h-screen">
      <section className="hidden lg:flex flex-col justify-between p-12 bg-[#eef3ef] border-r border-line">
        <p className="font-display text-xl">Travel Atlas</p>
        <div>
          <TileGridMark />
          <p className="mt-8 font-display text-3xl leading-snug max-w-md text-ink">
            Fifty states, one private notebook. Every city you mark fills in the map.
          </p>
        </div>
        <p className="text-sm text-ink-soft">Your journal is private to your account.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
