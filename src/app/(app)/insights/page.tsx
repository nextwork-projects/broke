import { redirect } from "next/navigation";

// For you folded into Plan (2026-10-23): its fee, interest, subscription, spike and idle cash checks are plan moves,
// its profile nudge is on Home, and its savings rate is a line on the plan. Old links land on the plan.
export default function Insights() {
  redirect("/plan");
}
