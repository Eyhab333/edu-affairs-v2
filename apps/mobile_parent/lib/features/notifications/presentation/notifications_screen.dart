import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/notifications/notification_route_resolver.dart';
import '../../../shared/widgets/app_background.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';

import '../data/parent_notification.dart';
import '../data/parent_notifications_service.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = ParentNotificationsService();

    return Scaffold(
      appBar: AppBar(
        title: const Text('الإشعارات'),
      ),
      body: AppBackground(
        child: AppContentContainer(
          maxWidth: 960,
          child: StreamBuilder<List<ParentNotification>>(
            stream: service.watchNotifications(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return AppErrorState(
                  title: 'تعذر تحميل الإشعارات',
                  message: snapshot.error.toString(),
                );
              }

              if (snapshot.connectionState == ConnectionState.waiting) {
                return const AppLoadingState(
                  message: 'جاري تحميل الإشعارات...',
                );
              }

              final notifications = snapshot.data ?? const [];

              if (notifications.isEmpty) {
                return const AppEmptyState(
                  icon: Icons.notifications_none_rounded,
                  title: 'لا توجد إشعارات',
                  message: 'ستظهر هنا التحديثات الجديدة المرتبطة بأبنائك.',
                );
              }

              return ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: notifications.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final notification = notifications[index];

                  return _NotificationCard(
                    notification: notification,
                    onOpen: () =>
                        _openNotification(context, service, notification),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }

  void _openNotification(
    BuildContext context,
    ParentNotificationsService service,
    ParentNotification notification,
  ) {
    if (!notification.isRead) {
      unawaited(service.markAsRead(notification.id).catchError((_) {}));
    }
    context.go(
      resolveParentNotificationPath(
        targetRoute: notification.targetRoute,
        targetParams: notification.targetParams,
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.onOpen,
  });

  final ParentNotification notification;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      onTap: () {
        onOpen();
      },
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
              Icon(
                notification.isRead
                    ? Icons.notifications_none
                    : Icons.notifications_active,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      notification.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: notification.isRead
                            ? FontWeight.w500
                            : FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(notification.body),
                    const SizedBox(height: 8),
                    Text(
                      _formatDate(notification.createdAt),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (!notification.isRead)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Icon(Icons.circle, size: 10),
                ),
        ],
      ),
    );
  }

  String _formatDate(int timestampMs) {
    if (timestampMs <= 0) return '';

    final date = DateTime.fromMillisecondsSinceEpoch(timestampMs);

    return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
  }
}
