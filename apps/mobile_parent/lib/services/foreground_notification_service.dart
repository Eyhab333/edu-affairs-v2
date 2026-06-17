import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ForegroundNotificationService {
  ForegroundNotificationService._();

  static final instance = ForegroundNotificationService._();

  static final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

  bool _started = false;
  GoRouter? _router;

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
              onPressed: () => _openFromMessage(message),
            ),
          ),
        );
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _openFromMessage(message);
    });

    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message == null) return;

      Future<void>.delayed(const Duration(milliseconds: 400), () {
        _openFromMessage(message);
      });
    });
  }

  void _openFromMessage(RemoteMessage message) {
    final router = _router;

    if (router == null) {
      debugPrint('Notification router is not ready: ${message.data}');
      return;
    }

    final path = _resolvePath(message.data);

    router.go(path);
  }

  String _resolvePath(Map<String, dynamic> data) {
    final targetRoute = _readString(data, 'targetRoute');

    switch (targetRoute) {
      case 'FINANCE':
        return '/notifications';

      case 'CHAT_CONVERSATION':
        return '/messages';

      case 'VIRTUAL_CLASS_SESSION':
        return '/notifications';

      case 'HOMEWORK_ASSIGNMENT':
        return '/notifications';

      case 'ANNOUNCEMENT':
        return '/notifications';

      case 'NOTIFICATION_DETAILS':
      default:
        return '/notifications';
    }
  }

  String _readString(Map<String, dynamic> data, String key) {
    final value = data[key];

    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }

    return '';
  }
}