import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
                    onMarkAsRead: () => service.markAsRead(notification.id),
                    onOpen: () => _openNotification(context, notification),
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
    ParentNotification notification,
  ) {
    if (notification.targetRoute == 'STUDENT_TRANSPORT') {
      final studentId = _readString(notification.targetParams, 'studentId');
      final serviceDate = _readString(
        notification.targetParams,
        'serviceDate',
      );
      if (studentId.isNotEmpty) {
        final query = <String, String>{'tab': 'transport'};
        if (serviceDate.isNotEmpty) query['serviceDate'] = serviceDate;
        context.go(
          '/students/${Uri.encodeComponent(studentId)}?${Uri(queryParameters: query).query}',
        );
        return;
      }
    }

  }

  String _readString(Map<String, dynamic> data, String key) {
    final value = data[key];
    return value is String ? value.trim() : '';
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.onMarkAsRead,
    required this.onOpen,
  });

  final ParentNotification notification;
  final VoidCallback onMarkAsRead;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      onTap: () {
        if (!notification.isRead) onMarkAsRead();
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
