import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../data/guardian_children_service.dart';
import '../models/parent_student_summary.dart';
import '../../notifications/data/parent_notifications_service.dart';

class MyChildrenScreen extends StatefulWidget {
  const MyChildrenScreen({super.key});

  @override
  State<MyChildrenScreen> createState() => _MyChildrenScreenState();
}

class _MyChildrenScreenState extends State<MyChildrenScreen> {
  late Future<List<ParentStudentSummary>> _future;

  final _service = GuardianChildrenService();
  final _notificationsService = ParentNotificationsService();
  @override
  void initState() {
    super.initState();
    _future = _service.loadMyChildren();
  }

  void _reload() {
    setState(() {
      _future = _service.loadMyChildren();
    });
  }

  Future<void> _signOut() async {
    await FirebaseAuth.instance.signOut();

    if (mounted) {
      context.go('/login');
    }
  }

  void _openStudent(ParentStudentSummary student) {
    context.go('/students/${student.studentId}');
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('أبنائي'),
        actions: [
          StreamBuilder<int>(
            stream: _notificationsService.watchUnreadCount(),
            builder: (context, snapshot) {
              final unreadCount = snapshot.data ?? 0;

              return IconButton(
                tooltip: unreadCount > 0
                    ? 'الإشعارات ($unreadCount)'
                    : 'الإشعارات',
                onPressed: () => context.go('/notifications'),
                icon: _NotificationIconWithBadge(count: unreadCount),
              );
            },
          ),
          IconButton(
            tooltip: 'تحديث',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'تسجيل الخروج',
            onPressed: _signOut,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: FutureBuilder<List<ParentStudentSummary>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const AppLoadingState(message: 'جاري تحميل الأبناء...');
            }

            if (snapshot.hasError) {
              return AppErrorState(
                title: 'تعذر تحميل الأبناء',
                message: snapshot.error.toString(),
                onRetry: _reload,
              );
            }

            final children = snapshot.data ?? [];

            if (children.isEmpty) {
              return AppEmptyState(
                icon: Icons.group_off_rounded,
                title: 'لا يوجد أبناء مرتبطون بهذا الحساب',
                message:
                    'الحساب ${user?.email ?? ''} لا يملك روابط أبناء نشطة حاليًا. تأكد من وجود GuardianLink نشط داخل Firestore.',
                action: OutlinedButton.icon(
                  onPressed: _reload,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('إعادة المحاولة'),
                ),
              );
            }

            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  _HeaderCard(
                    email: user?.email ?? '',
                    childrenCount: children.length,
                  ),


                  _AnnouncementsCard(
                    onTap: () => context.go('/announcements'),
                  ),
                  const SizedBox(height: AppSpacing.lg),


                  const SizedBox(height: AppSpacing.lg),
                  const AppSectionTitle(
                    title: 'اختر أحد الأبناء للمتابعة',
                    subtitle: 'يمكنك فتح ملف الطالب المختصر ومتابعة بياناته.',
                    icon: Icons.family_restroom_rounded,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  ...children.map(
                    (student) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: _StudentCard(
                        student: student,
                        onTap: () => _openStudent(student),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.email, required this.childrenCount});

  final String email;
  final int childrenCount;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return AppCard(
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Icon(
              Icons.family_restroom_rounded,
              color: colorScheme.primary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'مرحبًا بك',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              '$childrenCount أبناء',
              style: textTheme.bodySmall?.copyWith(
                color: colorScheme.primary,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentCard extends StatelessWidget {
  const _StudentCard({required this.student, required this.onTap});

  final ParentStudentSummary student;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: colorScheme.secondary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Icon(
              Icons.child_care_rounded,
              color: colorScheme.secondary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.studentName,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  student.schoolName.isEmpty
                      ? 'لم يتم تحديد المدرسة'
                      : student.schoolName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodyMedium?.copyWith(color: AppColors.text),
                ),
                const SizedBox(height: 4),
                Text(
                  student.classLine,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
                if (student.academicYearTitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    student.academicYearTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodySmall?.copyWith(
                      color: AppColors.softText,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppColors.soft,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                child: Text(
                  student.relationLabel,
                  style: textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              const Icon(Icons.chevron_left_rounded),
            ],
          ),
        ],
      ),
    );
  }
}

class _NotificationIconWithBadge extends StatelessWidget {
  const _NotificationIconWithBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final visibleCount = count > 99 ? '99+' : count.toString();

    return Stack(
      clipBehavior: Clip.none,
      children: [
        const Icon(Icons.notifications_rounded),
        if (count > 0)
          Positioned(
            top: -7,
            left: -7,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              padding: const EdgeInsets.symmetric(horizontal: 5),
              decoration: BoxDecoration(
                color: colorScheme.error,
                borderRadius: BorderRadius.circular(999),
              ),
              alignment: Alignment.center,
              child: Text(
                visibleCount,
                style: TextStyle(
                  color: colorScheme.onError,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
      ],
    );
  }
}







class _AnnouncementsCard extends StatelessWidget {
  const _AnnouncementsCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Icon(
              Icons.campaign_rounded,
              color: colorScheme.primary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'الإعلانات والأنشطة',
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'كل جديد يخص أبناءك في مكان واحد.',
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          const Icon(Icons.chevron_left_rounded),
        ],
      ),
    );
  }
}





