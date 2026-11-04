import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

const _retryableFunctionCodes = <String>{
  'unavailable',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unknown',
};

/// Retries a callable read at most twice when the failure is likely transient.
Future<T> retryTransientCallable<T>({
  required String operationName,
  required Future<T> Function() operation,
}) async {
  const delays = <Duration>[
    Duration.zero,
    Duration(seconds: 1),
    Duration(seconds: 2),
  ];

  for (var attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] != Duration.zero) {
      await Future<void>.delayed(delays[attempt]);
    }

    try {
      return await operation();
    } catch (error, stackTrace) {
      final canRetry = attempt < delays.length - 1 && _isTransient(error);
      if (!canRetry) Error.throwWithStackTrace(error, stackTrace);

      // Kept deliberately free of request data and user identifiers.
      debugPrint('$operationName transient failure; retrying attempt ${attempt + 2}.');
    }
  }

  throw StateError('Retry loop completed without a result.');
}

bool _isTransient(Object error) {
  if (error is FirebaseFunctionsException) {
    return _retryableFunctionCodes.contains(error.code.toLowerCase());
  }

  if (error is FirebaseException) {
    final code = error.code.toLowerCase();
    return code == 'network-request-failed' ||
        _retryableFunctionCodes.contains(code);
  }

  return error is TimeoutException;
}
