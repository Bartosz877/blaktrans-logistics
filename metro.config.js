const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force Metro to use the React Native build of @firebase/auth
// which contains getReactNativePersistence and initializeAuth
const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@firebase/auth" || moduleName === "@firebase/auth/dist/rn") {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/@firebase/auth/dist/rn/index.js"
      ),
      type: "sourceFile",
    };
  }
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
