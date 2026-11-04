import { redirect } from "next/navigation";
import { MoneyProvider } from "@/components/Money";
import { Onboarding, type Step } from "@/components/Onboarding";
import { countryOf } from "@/lib/countries";
import { getUser, userTz } from "@/lib/data";
import { fmtFor } from "@/lib/format";
import { addChoices } from "@/lib/providers";

// First run: the app layout sends new users here until onboarding is done (profile.onboarding, Onboarding.tsx).
// No country yet starts at the country picker; otherwise it resumes at the saved step.
export default async function WelcomePage() {
  const [{ user }, tz] = await Promise.all([getUser(), userTz()]);
  if (!user) redirect("/login");
  const profile = user.user_metadata?.profile ?? {};
  if (profile.country && (!profile.onboarding || profile.onboarding === "done")) redirect("/");
  const step = (profile.country ? profile.onboarding : "country") as Step;
  return (
    <MoneyProvider fmt={{ ...fmtFor(profile), tz }}>
      <main className="min-h-screen bg-canvas px-4 py-10 md:py-16 flex justify-center">
        <Onboarding profile={profile} start={step} choices={addChoices(countryOf(profile.country).code)} />
      </main>
    </MoneyProvider>
  );
}
