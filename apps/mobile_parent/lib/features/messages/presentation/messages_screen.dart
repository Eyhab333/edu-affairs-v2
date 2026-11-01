import 'package:flutter/material.dart';

import '../data/parent_message_thread.dart';
import '../data/parent_messages_service.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';

class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final service = ParentMessagesService();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppContentContainer(
        child: StreamBuilder<List<ParentMessageThread>>(
        stream: service.watchThreads(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return AppErrorState(
              title: 'تعذر تحميل الرسائل',
              message: 'تعذر تحميل الرسائل: ${snapshot.error}',
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const AppLoadingState(message: 'جاري تحميل الرسائل...');
          }

          final threads = snapshot.data ?? const [];

          if (threads.isEmpty) {
            return const AppEmptyState(
              icon: Icons.forum_outlined,
              title: 'لا توجد رسائل بعد',
              message: 'ستظهر هنا محادثاتك مع المدرسة عند إنشائها.',
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            itemCount: threads.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final thread = threads[index];

              return _ThreadCard(thread: thread);
            },
          );
        },
        ),
      ),
    );
  }
}

class _ThreadCard extends StatelessWidget {
  const _ThreadCard({required this.thread});

  final ParentMessageThread thread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasUnread = thread.unreadCount > 0;

    return AppCard(
      onTap: () {
        context.push('/messages/${Uri.encodeComponent(thread.id)}');
      },
      padding: const EdgeInsets.all(14),
      child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(child: Text(_avatarLetter(thread.otherDisplayName))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.otherDisplayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (thread.lastMessageAt != 0)
                          Text(
                            _formatTime(thread.lastMessageAt),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      thread.lastMessageSummary.isEmpty
                          ? 'لم تبدأ المحادثة بعد'
                          : thread.lastMessageSummary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _ChipLabel(text: _threadTypeLabel(thread)),
                        if (thread.studentId.isNotEmpty)
                          _ChipLabel(text: 'طالب'),
                        if (hasUnread) _UnreadChip(count: thread.unreadCount),
                      ],
                    ),
                  ],
                ),
              ),
            ],
      ),
    );
  }

  String _threadTypeLabel(ParentMessageThread thread) {
    if (thread.isInternal) return 'داخلي';

    switch (thread.type) {
      case 'STUDENT_CONTEXT':
        return 'مرتبطة بطالب';
      case 'CASE_CONTEXT':
        return 'مرتبطة بحالة';
      case 'GROUP':
        return 'مجموعة';
      default:
        return 'محادثة';
    }
  }

  String _avatarLetter(String value) {
    final text = value.trim();

    if (text.isEmpty) return 'ر';

    return text.characters.first;
  }

  String _formatTime(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final now = DateTime.now();

    final isToday =
        date.year == now.year && date.month == now.month && date.day == now.day;

    if (isToday) {
      final hour = date.hour.toString().padLeft(2, '0');
      final minute = date.minute.toString().padLeft(2, '0');
      return '$hour:$minute';
    }

    return '${date.day}/${date.month}/${date.year}';
  }
}

class _ChipLabel extends StatelessWidget {
  const _ChipLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text, style: theme.textTheme.labelSmall),
    );
  }
}

class _UnreadChip extends StatelessWidget {
  const _UnreadChip({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$count جديد',
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onPrimary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

