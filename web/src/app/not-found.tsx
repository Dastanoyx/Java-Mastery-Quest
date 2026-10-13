import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <Compass size={28} className="mx-auto text-faint" aria-hidden />
      <h1 className="mt-4 text-[22px] font-semibold text-ink">This path isn&apos;t on the map</h1>
      <p className="mt-2 text-muted">The page doesn&apos;t exist — or the lesson, exam attempt or exercise it pointed to has been removed.</p>
      <div className="mt-6 flex justify-center gap-2"><LinkButton href="/" variant="primary">Command Center</LinkButton><LinkButton href="/curriculum">Learning World</LinkButton></div>
    </div>
  );
}
