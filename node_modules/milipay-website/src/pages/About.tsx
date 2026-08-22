import { FadeIn } from '../components/ui/FadeIn';

export function About() {
  return (
    <div className="overflow-hidden bg-white">
      <section className="pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <FadeIn>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
              The Infrastructure for a Cardless Africa.
            </h1>
            <p className="text-lg text-gray-600 mb-10 leading-relaxed">
              MiliPay was founded to solve a systemic infrastructure problem: point-of-sale friction and card fraud. By bypassing legacy card networks and building a direct, biometric-to-bank authorization layer, we are creating the most secure and reliable payment settlement network on the continent.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Investor Roadmap */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <FadeIn delay={200}>
            <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">Strategic Roadmap</h2>
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-sm">
                  P0
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-primary/20 shadow-[0_0_15px_rgba(14,173,105,0.05)]">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Phase 0: Architecture & Proof of Concept</h3>
                  <p className="text-sm text-gray-600">Current Phase. Core engineering of the non-custodial gateway, merchant POS APIs, and agent portal architecture.</p>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-gray-50 text-gray-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-sm">
                  P1
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-gray-100">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Phase 1: Alpha Testing</h3>
                  <p className="text-sm text-gray-600">Controlled rollout with 2 initial partner banks and 5 flagship supermarket chains in Lagos.</p>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-gray-50 text-gray-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-sm">
                  P2
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-gray-100">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Phase 2: Agent Network Scaling</h3>
                  <p className="text-sm text-gray-600">Deploying hardware scanners to 1,000 certified agents for rapid customer identity onboarding.</p>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-gray-50 text-gray-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-bold text-sm">
                  P3
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-2xl border border-gray-100">
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Phase 3 & 4: National Expansion</h3>
                  <p className="text-sm text-gray-600">Full API release for third-party POS manufacturers and expansion into Tier 2 cities.</p>
                </div>
              </div>

            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
