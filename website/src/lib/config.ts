/**
 * The app's launch state, in one place (design handoff: "Make the launch
 * state one config flag"). While false, every "Get early access" leads to the
 * waitlist and the store badges are "Coming soon". Flip it on launch day and
 * fill in the store links.
 */
export const APP_LIVE = false;

export const STORE_LINKS = {
  appStore: "",
  googlePlay: "",
};

export const SUPPORT_EMAIL = "support@milipay.ng";
