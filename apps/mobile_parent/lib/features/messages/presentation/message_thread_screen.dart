import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../data/parent_message_thread.dart';
import '../data/parent_messages_service.dart';
import '../data/parent_thread_message.dart';
import 'package:cloud_functions/cloud_functions.dart';

class MessageThreadScreen extends StatefulWidget {
  const MessageThreadScreen({required this.threadId, super.key});

  final String threadId;

  @override
  State<MessageThreadScreen> createState() => _MessageThreadScreenState();
}

class _MessageThreadScreenState extends State<MessageThreadScreen> {
  String _lastMarkedReadKey = '';

  void _markThreadReadIfNeeded({
    required ParentMessagesService service,
    required ParentMessageThread thread,
  }) {
    final unreadCount = thread.currentParticipant?.unreadCount ?? 0;

    if (unreadCount <= 0) {
      return;
    }

    final latestActivity = thread.lastMessageAt == 0
        ? thread.updatedAt
        : thread.lastMessageAt;

    final markKey = '${thread.id}:$unreadCount:$latestActivity';

    if (_lastMarkedReadKey == markKey) {
      return;
    }

    _lastMarkedReadKey = markKey;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      service.markThreadRead(threadId: thread.id).catchError((error) {
        debugPrint('Failed to mark parent thread as read: $error');
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final service = ParentMessagesService();
    final currentUid = FirebaseAuth.instance.currentUser?.uid ?? '';

    return StreamBuilder<ParentMessageThread?>(
      stream: service.watchThread(widget.threadId),
      builder: (context, threadSnapshot) {
        final thread = threadSnapshot.data;

        return Scaffold(
          appBar: AppBar(
            title: Text(thread?.otherDisplayName ?? 'المحادثة'),
            centerTitle: true,
          ),
          body: Builder(
            builder: (context) {
              if (threadSnapshot.hasError) {
                return _ErrorState(
                  message: 'تعذر تحميل المحادثة: ${threadSnapshot.error}',
                );
              }

              if (threadSnapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (thread == null) {
                return const _ErrorState(
                  message:
                      'المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها.',
                );
              }

              _markThreadReadIfNeeded(service: service, thread: thread);

              return Column(
                children: [
                  _ThreadHeader(thread: thread),
                  Expanded(
                    child: StreamBuilder<List<ParentThreadMessage>>(
                      stream: service.watchMessages(widget.threadId),
                      builder: (context, messagesSnapshot) {
                        if (messagesSnapshot.hasError) {
                          return _ErrorState(
                            message:
                                'تعذر تحميل الرسائل: ${messagesSnapshot.error}',
                          );
                        }

                        if (messagesSnapshot.connectionState ==
                            ConnectionState.waiting) {
                          return const Center(
                            child: CircularProgressIndicator(),
                          );
                        }

                        final messages = messagesSnapshot.data ?? const [];

                        if (messages.isEmpty) {
                          return const _EmptyMessagesState();
                        }

                        return ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: messages.length,
                          itemBuilder: (context, index) {
                            final message = messages[index];

                            return _MessageBubble(
                              message: message,
                              isMine: message.senderUid == currentUid,
                            );
                          },
                        );
                      },
                    ),
                  ),

                  MessageComposer(
                    service: service,
                    threadId: widget.threadId,
                    enabled: thread.status == 'ACTIVE',
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class _ThreadHeader extends StatelessWidget {
  const _ThreadHeader({required this.thread});

  final ParentMessageThread thread;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _SmallChip(text: _threadTypeLabel(thread)),
          if (thread.studentId.isNotEmpty) const _SmallChip(text: 'طالب'),
          if (thread.classId.isNotEmpty) _SmallChip(text: thread.classId),
          if (thread.schoolId.isNotEmpty) _SmallChip(text: thread.schoolId),
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
}

class _SmallChip extends StatelessWidget {
  const _SmallChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(text, style: theme.textTheme.labelSmall),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isMine});

  final ParentThreadMessage message;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final bubbleColor = isMine
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHighest;

    final textColor = isMine
        ? theme.colorScheme.onPrimary
        : theme.colorScheme.onSurface;

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: isMine
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Text(
              isMine ? 'أنت' : message.senderDisplayName,
              style: theme.textTheme.labelSmall?.copyWith(
                color: textColor.withValues(alpha: 0.82),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message.body.isEmpty ? 'رسالة بدون نص' : message.body,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: textColor,
                height: 1.5,
              ),
            ),
            if (message.createdAt != 0) ...[
              const SizedBox(height: 6),
              Text(
                _formatTime(message.createdAt),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: textColor.withValues(alpha: 0.72),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(int timestamp) {
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);

    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');

    return '$hour:$minute';
  }
}

class _EmptyMessagesState extends StatelessWidget {
  const _EmptyMessagesState();

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('لا توجد رسائل في هذه المحادثة بعد'));
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.error,
          ),
        ),
      ),
    );
  }
}

class MessageComposer extends StatefulWidget {
  const MessageComposer({
    required this.service,
    required this.threadId,
    required this.enabled,
    super.key,
  });

  final ParentMessagesService service;
  final String threadId;
  final bool enabled;

  @override
  State<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends State<MessageComposer> {
  final _controller = TextEditingController();

  bool _sending = false;
  String _error = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();

    if (_sending || !widget.enabled || text.isEmpty) {
      return;
    }

    setState(() {
      _sending = true;
      _error = '';
    });

    try {
      await widget.service.sendMessage(threadId: widget.threadId, body: text);

      _controller.clear();
    } catch (error) {
      setState(() {
        _error = _readErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
        });
      }
    }
  }

  String _readErrorMessage(Object error) {
    if (error is FirebaseFunctionsException) {
      return error.message ?? 'تعذر إرسال الرسالة';
    }

    if (error is ArgumentError) {
      return error.message?.toString() ?? 'تعذر إرسال الرسالة';
    }

    return 'تعذر إرسال الرسالة';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(top: BorderSide(color: theme.dividerColor)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error.isNotEmpty) ...[
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onErrorContainer,
                  ),
                ),
              ),
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    enabled: widget.enabled && !_sending,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.newline,
                    decoration: InputDecoration(
                      hintText: widget.enabled
                          ? 'اكتب رسالتك هنا...'
                          : 'هذه المحادثة مغلقة',
                      filled: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(18),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                    ),
                    onChanged: (_) {
                      if (_error.isNotEmpty) {
                        setState(() {
                          _error = '';
                        });
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending || !widget.enabled ? null : _send,
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  tooltip: 'إرسال',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
