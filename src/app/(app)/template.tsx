import { Reveal } from "@/components/motion";
import { Toaster } from "@/components/Toast";

// A template re-mounts on every navigation (a layout does not), so each page gets its entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Reveal>{children}</Reveal>
      <Toaster />
    </>
  );
}
