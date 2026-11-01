import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_router.dart';
import 'app_theme.dart';
import 'theme_controller.dart';

import '../services/foreground_notification_service.dart';

class ParentApp extends StatelessWidget {
  const ParentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: appThemeController,
      builder: (context, _) => MaterialApp.router(
        debugShowCheckedModeBanner: false,
        scaffoldMessengerKey:
            ForegroundNotificationService.scaffoldMessengerKey,
        title: 'تطبيق ولي الأمر',
        theme: buildAppLightTheme(),
        darkTheme: buildAppDarkTheme(),
        themeMode: appThemeController.themeMode,
        routerConfig: appRouter,
        locale: const Locale('ar'),
        builder: (context, child) {
          final theme = Theme.of(context);
          final isDark = theme.brightness == Brightness.dark;
          final systemUiStyle = SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness:
                isDark ? Brightness.light : Brightness.dark,
            statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
            systemNavigationBarColor: theme.scaffoldBackgroundColor,
            systemNavigationBarIconBrightness:
                isDark ? Brightness.light : Brightness.dark,
            systemNavigationBarDividerColor: Colors.transparent,
            systemStatusBarContrastEnforced: false,
            systemNavigationBarContrastEnforced: false,
          );

          return AnnotatedRegion<SystemUiOverlayStyle>(
            value: systemUiStyle,
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: child ?? const SizedBox.shrink(),
            ),
          );
        },
      ),
    );
  }
}
