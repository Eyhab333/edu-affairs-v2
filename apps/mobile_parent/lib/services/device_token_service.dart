import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

const webVapidKey =
    'BJU1plPF3C-I7uBjJvezVIMXPC2HC1669RunhOaIr8Ddu-LWGiAGBsSNe00TllBnHQgN2nD5L-a7lR5XOZuJZq0';

class DeviceTokenService {
  DeviceTokenService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseMessaging? messaging,
    this.orgId = 'takween',
  }) : _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance,
       _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;
  final FirebaseMessaging _messaging;
  final String orgId;
  static const _installIdKey = 'takween_parent_install_id';
  static const _androidPermissionRequestedKey =
      'takween_parent_android_notification_permission_requested';
  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;

    _auth.authStateChanges().listen((user) async {
      if (user == null) return;
      await saveCurrentDeviceToken();
    });

    // The notification backend still sends to FCM registration tokens, not FIDs.
    // ignore: deprecated_member_use
    _messaging.onTokenRefresh
        .listen((token) async {
          await _saveToken(token);
        })
        .onError((error) {
          debugPrint('FCM token refresh failed: $error');
        });
  }

  Future<void> saveCurrentDeviceToken() async {
    final user = _auth.currentUser;
    if (user == null) return;

    try {
      final settings = await _notificationSettings();

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('Notification permission denied.');
        return;
      }

      // Keep the token contract until the backend migrates to FID registration.
      // ignore: deprecated_member_use
      final token = await _messaging.getToken(
        vapidKey: kIsWeb ? webVapidKey : null,
      );

      if (token == null || token.trim().isEmpty) {
        debugPrint('FCM token is empty.');
        return;
      }

      await _saveToken(token);
    } catch (error) {
      debugPrint('Failed to save FCM token: $error');
    }
  }

  Future<NotificationSettings> _notificationSettings() async {
    final isAndroid =
        !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

    if (!isAndroid) {
      return _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    final prefs = await SharedPreferences.getInstance();
    final permissionWasRequested =
        prefs.getBool(_androidPermissionRequestedKey) ?? false;

    if (permissionWasRequested) {
      return _messaging.getNotificationSettings();
    }

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    await prefs.setBool(_androidPermissionRequestedKey, true);
    return settings;
  }

  Future<void> _saveToken(String fcmToken) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final userDoc = await _firestore.doc('users/${user.uid}').get();
    final userData = userDoc.data();

    final personId = _readString(userData, 'personId');
    final platform = _resolvePlatform();
    final now = DateTime.now().millisecondsSinceEpoch;

    final installId = await _getOrCreateInstallId();

    final tokenDocId = '${user.uid}_mobile-parent_$installId';
    final tokenRef = _firestore.doc('orgs/$orgId/deviceTokens/$tokenDocId');
    final existing = await tokenRef.get();

    final data = <String, dynamic>{
      'id': tokenDocId,
      'orgId': orgId,

      'uid': user.uid,
      'personId': personId,
      'staffPersonId': '',

      'platform': platform,
      'app': 'mobile-parent',

      'fcmToken': fcmToken,
      'deviceId': installId,

      'isActive': true,

      'lastSeenAt': now,
      'updatedAt': now,

      'lastErrorCode': '',
      'lastErrorMessage': '',
      'disabledAt': FieldValue.delete(),
    };

    if (!existing.exists) {
      data['createdAt'] = now;
    }

    await tokenRef.set(data, SetOptions(merge: true));

    debugPrint('FCM token saved: $tokenDocId');
  }

  /// Deactivates this installation only; historical token records are retained.
  Future<void> deactivateCurrentDeviceToken() async {
    final user = _auth.currentUser;
    if (user == null) return;

    final installId = await _getOrCreateInstallId();
    final tokenDocId = '${user.uid}_mobile-parent_$installId';
    final now = DateTime.now().millisecondsSinceEpoch;

    await _firestore.doc('orgs/$orgId/deviceTokens/$tokenDocId').set({
      'isActive': false,
      'disabledAt': now,
      'updatedAt': now,
    }, SetOptions(merge: true));
  }

  String _resolvePlatform() {
    if (kIsWeb) return 'WEB';

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'ANDROID';
      case TargetPlatform.iOS:
        return 'IOS';
      default:
        return 'UNKNOWN';
    }
  }

  String _readString(
    Map<String, dynamic>? data,
    String key, {
    String fallback = '',
  }) {
    final value = data?[key];

    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }

    return fallback;
  }

  Future<String> _getOrCreateInstallId() async {
    final prefs = await SharedPreferences.getInstance();

    final existing = prefs.getString(_installIdKey);
    if (existing != null && existing.trim().isNotEmpty) {
      return existing.trim();
    }

    final next = _generateInstallId();
    await prefs.setString(_installIdKey, next);

    return next;
  }

  String _generateInstallId() {
    final random = Random.secure();
    final values = List<int>.generate(16, (_) => random.nextInt(256));

    return values.map((value) {
      return value.toRadixString(16).padLeft(2, '0');
    }).join();
  }
}
