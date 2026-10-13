import {
  Binary, GitBranch, Boxes, TriangleAlert, Library, Waves, Package, Cpu, HardDrive, Languages, BookOpenCheck, Terminal, Eye, Flame,
  Target, Brain, RotateCcw, Swords, Crown, Map, Timer, BadgeCheck, Trophy, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  binary: Binary, "git-branch": GitBranch, boxes: Boxes, "triangle-alert": TriangleAlert, library: Library, waves: Waves, package: Package,
  cpu: Cpu, "hard-drive": HardDrive, languages: Languages, "book-open-check": BookOpenCheck, terminal: Terminal, eye: Eye, flame: Flame,
  target: Target, brain: Brain, "rotate-ccw": RotateCcw, swords: Swords, crown: Crown, map: Map, timer: Timer, "badge-check": BadgeCheck, trophy: Trophy,
};

export function NamedIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? Boxes;
  return <I size={size} className={className} aria-hidden strokeWidth={1.75} />;
}
