import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'app/parent_app.dart';
import 'app/theme_controller.dart';
import 'firebase_options.dart';
import 'services/device_token_service.dart';
import 'services/foreground_notification_service.dart';
import 'app/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await appThemeController.load();
  ForegroundNotificationService.instance.start(router: appRouter);
  runApp(const ParentApp());

  WidgetsBinding.instance.addPostFrameCallback((_) {
    DeviceTokenService().start();
  });
}
