import { FadeIn } from '../components/ui/FadeIn';

export function About() {
  return (
    <div className="overflow-hidden bg-white">
      <section className="pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <FadeIn>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
              A Cardless Africa.
            </h1>
            <p className="text-lg text-gray-600 mb-10 leading-relaxed">
              BioPay was founded on a simple principle: financial access shouldn't depend on carrying plastic cards, remembering 4-digit PINs, or owning a smartphone. By turning your unique biometric identity into your universal payment gateway, we are building the most inclusive, secure, and seamless financial network on the continent.
            </p>
          </FadeIn>
        </div>
      </section>
      
      <section className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <FadeIn delay={100}>
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Contact Us</h2>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 inline-block text-left w-full max-w-md mx-auto">
              <form className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Jane Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="jane@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea rows={4} className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="How can we help?"></textarea>
                </div>
                <button type="button" className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl transition-all">
                  Send Message
                </button>
              </form>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
