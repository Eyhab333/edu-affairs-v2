import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme_controller.dart';
import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../guardian/data/guardian_children_service.dart';
import '../../guardian/models/parent_student_summary.dart';

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

  Future<void> _openActivities(BuildContext context) async {
    try {
      final children = await GuardianChildrenService().loadMyChildren();
      if (!context.mounted) return;

      if (children.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('لا يوجد أبناء مرتبطون بهذا الحساب.')),
        );
        return;
      }

      ParentStudentSummary? selectedStudent;
      if (children.length == 1) {
        selectedStudent = children.first;
      } else {
        selectedStudent = await showModalBottomSheet<ParentStudentSummary>(
          context: context,
          showDragHandle: true,
          builder: (sheetContext) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.lg,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'اختر الطالب',
                    style: Theme.of(sheetContext)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'اختر ملف الطالب الذي تريد عرض أنشطته.',
                    style: Theme.of(sheetContext).textTheme.bodySmall?.copyWith(
                      color: Theme.of(sheetContext)
                          .colorScheme
                          .onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 420),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: children.length,
                      separatorBuilder: (_, _) =>
                          const SizedBox(height: AppSpacing.sm),
                      itemBuilder: (context, index) {
                        final student = children[index];
                        return AppCard(
                          onTap: () => Navigator.of(sheetContext).pop(student),
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.school_rounded),
                            title: Text(
                              student.studentName,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w900),
                            ),
                            subtitle: Text(
                              [student.schoolName, student.classLine]
                                  .where((value) => value.isNotEmpty)
                                  .join(' • '),
                            ),
                            trailing: const Icon(Icons.chevron_left_rounded),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }

      if (!context.mounted || selectedStudent == null) return;
      context.push(
        '/students/${Uri.encodeComponent(selectedStudent.studentId)}/activities',
      );
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('تعذر تحميل الأبناء: $error')),
      );
    }
  }

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('تسجيل الخروج'),
            content: const Text('هل تريد تسجيل الخروج من حسابك؟'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('تسجيل الخروج'),
              ),
            ],
          ),
        ) ?? false;
    if (!confirmed) return;
    await FirebaseAuth.instance.signOut();
    if (context.mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        top: false,
        child: AppContentContainer(
          child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          children: [
            const _SectionLabel(
              title: 'الخدمات المالية',
              subtitle: 'وصول سريع إلى رسوم الأبناء وعمليات السداد.',
            ),
            const SizedBox(height: AppSpacing.md),
            _ServiceTile(
              icon: Icons.account_balance_wallet_rounded,
              title: 'الرسوم والمدفوعات',
              subtitle: 'متابعة المستحقات والمدفوعات والإيصالات',
              onTap: () => context.push('/guardian-finance'),
            ),
            const SizedBox(height: AppSpacing.md),
            _ServiceTile(
              icon: Icons.emoji_events_rounded,
              title: 'الأنشطة',
              subtitle: 'عرض الأنشطة المتاحة لكل طالب',
              onTap: () => _openActivities(context),
            ),
            const SizedBox(height: AppSpacing.xl),
            const _SectionLabel(
              title: 'المظهر',
              subtitle: 'اختر المظهر الأنسب لك، وسيُحفظ على هذا الجهاز.',
            ),
            const SizedBox(height: AppSpacing.md),
            AnimatedBuilder(
              animation: appThemeController,
              builder: (context, _) => AppCard(
                child: SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  secondary: _TileIcon(
                    icon: appThemeController.isDarkMode
                        ? Icons.dark_mode_rounded
                        : Icons.light_mode_rounded,
                  ),
                  title: const Text(
                    'الوضع الداكن',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    appThemeController.isDarkMode
                        ? 'مفعّل الآن'
                        : 'الوضع الفاتح مفعّل الآن',
                  ),
                  value: appThemeController.isDarkMode,
                  onChanged: appThemeController.setDarkMode,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const _SectionLabel(
              title: 'الحساب',
              subtitle: 'إدارة جلسة حساب ولي الأمر على هذا الجهاز.',
            ),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              onTap: () => _signOut(context),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: _TileIcon(
                  icon: Icons.logout_rounded,
                  color: Theme.of(context).colorScheme.error,
                ),
                title: Text(
                  'تسجيل الخروج',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                subtitle: const Text('إنهاء الجلسة الحالية بأمان'),
                trailing: const Icon(Icons.chevron_left_rounded),
              ),
            ),
          ],
          ),
        ),
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          _TileIcon(icon: icon),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
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

class _TileIcon extends StatelessWidget {
  const _TileIcon({required this.icon, this.color});

  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final resolvedColor = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: resolvedColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Icon(icon, color: resolvedColor),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
        const SizedBox(height: 3),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}
