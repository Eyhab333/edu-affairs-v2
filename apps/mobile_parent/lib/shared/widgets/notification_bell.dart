import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/notifications/data/parent_notifications_service.dart';

class NotificationBell extends StatelessWidget {
  NotificationBell({super.key});

  final ParentNotificationsService _service = ParentNotificationsService();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<int>(
      stream: _service.watchUnreadCount(),
      builder: (context, snapshot) {
        final unreadCount = snapshot.data ?? 0;

        return IconButton(
          tooltip: unreadCount > 0
              ? 'الإشعارات ($unreadCount)'
              : 'الإشعارات',
          onPressed: () => context.push('/notifications'),
          icon: Stack(
            clipBehavior: Clip.none,
            children: [
              const Icon(Icons.notifications_rounded),
              if (unreadCount > 0)
                Positioned(
                  top: -7,
                  left: -8,
                  child: Container(
                    constraints: const BoxConstraints(
                      minWidth: 18,
                      minHeight: 18,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.error,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: Theme.of(context).colorScheme.surface,
                        width: 1.5,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      unreadCount > 99 ? '99+' : '$unreadCount',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onError,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
