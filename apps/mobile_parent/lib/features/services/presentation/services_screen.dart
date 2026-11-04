import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme_controller.dart';
import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_content_container.dart';
import '../../../services/device_token_service.dart';

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

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
    try {
      await DeviceTokenService().deactivateCurrentDeviceToken();
    } catch (_) {
      // Token cleanup must never prevent an explicit logout.
    }
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
              title: 'الخدمات',
              subtitle: 'خدمات إضافية لولي الأمر سيتم تفعيلها تباعًا.',
            ),
            const SizedBox(height: AppSpacing.md),
            _ServiceTile(
              icon: Icons.account_balance_wallet_rounded,
              title: 'الرسوم والمدفوعات',
              subtitle: 'متابعة المستحقات والمدفوعات والإيصالات',
              isComingSoon: true,
            ),
            const SizedBox(height: AppSpacing.md),
            _ServiceTile(
              icon: Icons.emoji_events_rounded,
              title: 'الأنشطة',
              subtitle: 'عرض الأنشطة المتاحة لكل طالب',
              isComingSoon: true,
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
    this.isComingSoon = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool isComingSoon;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Opacity(
        opacity: isComingSoon ? 0.72 : 1,
        child: Row(
          children: [
            _TileIcon(
              icon: icon,
              color: isComingSoon
                  ? Theme.of(context).colorScheme.onSurfaceVariant
                  : null,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w900,
                              ),
                        ),
                      ),
                      if (isComingSoon) const _ComingSoonBadge(),
                    ],
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
            if (!isComingSoon) ...[
              const SizedBox(width: AppSpacing.sm),
              const Icon(Icons.chevron_left_rounded),
            ],
          ],
        ),
      ),
    );
  }
}

class _ComingSoonBadge extends StatelessWidget {
  const _ComingSoonBadge();

  @override
  Widget build(BuildContext context) {
    final gold = context.appPalette.gold;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: gold.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: gold.withValues(alpha: 0.25)),
      ),
      child: Text(
        'قريبًا',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: gold,
              fontWeight: FontWeight.w900,
            ),
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
