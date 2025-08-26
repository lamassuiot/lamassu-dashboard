// public/config.js

/**
 * This file is intended to be used for runtime configuration of the Lamassu UI.
 * It will be loaded by a <script> tag in the main HTML document, making the `lamassuConfig`
 * object available on the `window` object.
 *
 * This allows for easy configuration in different environments (dev, staging, prod)
 * without needing to rebuild the Next.js application. This is particularly useful
 * for containerized deployments (e.g., Docker) where you can mount a different
 * `config.js` file for each environment.
 *
 * Example:
 * You can set these values based on environment variables when your container starts.
 */
window.lamassuConfig = {
    // --- Core API Endpoint ---
    // The base URL for all backend API services (CA, DMS, DevManager, etc.).
    // This should be the root of your API gateway or load balancer.
    // Example: "https://api.yourdomain.com"
    LAMASSU_API: "https://demo-api.lamassu.cloud/prod",
  
    // --- Authentication (OIDC) ---
    // Set to `false` to disable OIDC authentication and use a mock user for development.
    // In a production environment, this should always be `true`.
    LAMASSU_AUTH_ENABLED: true,
  
    // The OIDC provider's URL. All OIDC endpoints (.well-known, authorization, token)
    // are relative to this authority.
    // Example: "https://auth.yourdomain.com/realms/your-realm"
    //LAMASSU_AUTH_AUTHORITY: "https://lab.lamassu.io/auth/realms/lamassu",
    LAMASSU_AUTH_AUTHORITY: "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_d2VFzoHA2",
    
    // The OIDC client ID registered with your provider for this frontend application.
    //LAMASSU_AUTH_CLIENT_ID: "frontend",
    LAMASSU_AUTH_CLIENT_ID: "2sskv9h3clq7ctls2sg7u4grlk",
      
    // --- UI Customization ---
    // Set to true to enable loading of a custom footer from /public/footer.html
    LAMASSU_FOOTER_ENABLED: false,
  
    // A comma-separated list of available connector instances for platform integrations.
    // This allows the UI to present a list of possible integrations to the user.
    // Example: "aws.123456789012.eu-west-1,aws.987654321098.us-east-1"
    LAMASSU_CONNECTORS: [
      "aws.1010101010.eu-west-1"
    ]
  };
  