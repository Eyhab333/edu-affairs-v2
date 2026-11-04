import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../shared/notifications/notification_route_resolver.dart';

class ForegroundNotificationService {
  ForegroundNotificationService._();

  static final instance = ForegroundNotificationService._();

  static final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

  bool _started = false;
  GoRouter? _router;
  final Set<String> _handledNotificationIds = <String>{};

  void start({required GoRouter router}) {
    if (_started) return;

    _started = true;
    _router = router;

    FirebaseMessaging.onMessage.listen((message) {
      final title = message.notification?.title ?? 'إشعار جديد';
      final body = message.notification?.body ?? 'لديك تحديث جديد من المنصة.';

      final messenger = scaffoldMessengerKey.currentState;

      if (messenger == null) {
        debugPrint('Foreground notification: $title - $body');
        return;
      }

      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text('$title\n$body'),
            duration: const Duration(seconds: 6),
            action: SnackBarAction(
              label: 'فتح',
              onPressed: () => unawaited(_openFromMessage(message)),
            ),
          ),
        );
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      unawaited(_openFromMessage(message));
    });

    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message == null) return;
      unawaited(_openFromMessage(message));
    });
  }

  Future<void> _openFromMessage(RemoteMessage message) async {
    final router = _router;

    if (router == null) {
      debugPrint('Notification router is not ready: ${message.data}');
      return;
    }

    final notificationId = message.data['notificationId']?.trim() ?? '';
    if (notificationId.isNotEmpty && !_handledNotificationIds.add(notificationId)) {
      return;
    }

    if (FirebaseAuth.instance.currentUser == null) {
      try {
        await FirebaseAuth.instance.authStateChanges().first;
      } catch (_) {
        // The router will safely redirect unauthenticated users to login.
      }
    }

    final path = resolveParentNotificationPath(data: message.data);

    router.go(path);
  }
}
