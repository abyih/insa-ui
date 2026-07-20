const isBrowser = typeof window !== "undefined"; // Check if we are in the browser

const config = {
  baseURL: "",
  adSalPort: "8080",
  mdSalPort: "8181",
  mdSalSecuredPort: "8443",
  configEnv: "ENV_PROD",

  getBaseURL: function (salType) {
    if (salType !== undefined) {
      let urlPrefix = "";
      if (this.configEnv === "ENV_DEV") {
        urlPrefix = this.baseURL;
      } else {
        // Make sure `window` is only used in the browser
        if (isBrowser) {
          urlPrefix =
            window.location.protocol + "//" + window.location.hostname + ":";
        } else {
          urlPrefix = "http://localhost:"; // Default to localhost if not in the browser
        }
      }

      if (salType === "AD_SAL") {
        return urlPrefix + this.adSalPort;
      } else if (salType === "MD_SAL") {
        let basePort = this.mdSalPort;
        if (isBrowser && window.location.protocol === "https:") {
          basePort = this.mdSalSecuredPort;
        }
        return urlPrefix + basePort;
      }
    }
    return ""; // Default behavior
  },
};

export default config;
