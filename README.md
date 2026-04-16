# 這是測試用的branch，用於測試 yangchenin fork並修改後的後端，會在之後視情況刪除。

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Mapbox & Location Sharing

This project integrates Mapbox and location-sharing features, which require a **Custom Native Build**. Standard Expo Go cannot be used.

### Build and Test (Android)

To build and run the app for Android, you must provide your Mapbox download token:

```bash
# Set your Mapbox Secret Token (starts with sk.)
export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=your_token_here

# Clean and rebuild the native project
npx expo prebuild --clean

# Run the app on an Android device or emulator
npx expo run:android --device
```

> **Note:** The `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` is required by the Mapbox SDK to download native dependencies during the build process.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
