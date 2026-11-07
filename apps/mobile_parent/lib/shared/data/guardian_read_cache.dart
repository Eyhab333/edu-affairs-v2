import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

// Memory only. Every request is scoped to the signed-in user and student.
class GuardianReadCache<T> {
  GuardianReadCache() {
    _auth.authStateChanges().listen((user) => _setUser(user?.uid));
  }

  static const _freshness = Duration(seconds: 30);
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final Map<String, _CacheEntry<T>> _entries = {};
  String? _uid;
  int _generation = 0;

  void _setUser(String? uid) {
    if (_uid == uid) return;
    _uid = uid;
    _generation++;
    _entries.clear();
  }

  void clear() {
    _generation++;
    _entries.clear();
  }

  Future<T> load({
    required String studentId,
    required String operation,
    required Future<T> Function() fetch,
    bool forceRefresh = false,
  }) {
    final uid = _auth.currentUser?.uid;
    _setUser(uid);
    if (uid == null) {
      return Future<T>.error(StateError('Authentication required.'));
    }

    final existing = _entries[studentId];
    if (existing != null) {
      if (existing.pending != null && !forceRefresh) {
        return existing.pending!;
      }
      if (!forceRefresh &&
          existing.value != null &&
          existing.loadedAt != null &&
          DateTime.now().difference(existing.loadedAt!) < _freshness) {
        return Future<T>.value(existing.value as T);
      }
    }

    final generation = _generation;
    final entry = _CacheEntry<T>();
    _entries[studentId] = entry;
    final stopwatch = Stopwatch()..start();
    final future = Future<T>.sync(fetch).then((value) {
      if (_generation != generation || _auth.currentUser?.uid != uid) {
        throw StateError('Authentication changed while loading data.');
      }
      if (identical(_entries[studentId], entry)) {
        entry.value = value;
        entry.loadedAt = DateTime.now();
        entry.pending = null;
      }
      return value;
    }).catchError((Object error, StackTrace stack) {
      if (identical(_entries[studentId], entry)) {
        _entries.remove(studentId);
      }
      Error.throwWithStackTrace(error, stack);
    }).whenComplete(() {
      if (kDebugMode) {
        debugPrint('guardian_request operation=$operation durationMs=${stopwatch.elapsedMilliseconds}');
      }
    });
    entry.pending = future;
    return future;
  }
}

class _CacheEntry<T> {
  T? value;
  DateTime? loadedAt;
  Future<T>? pending;
}
