import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../shared/theme/app_tokens.dart';
import '../shared/widgets/app_background.dart';
import '../shared/widgets/app_content_container.dart';
import '../shared/widgets/notification_bell.dart';

class ParentShell extends StatelessWidget {
  const ParentShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const _destinations = <_ShellDestination>[
    _ShellDestination(
      title: 'أبنائي',
      subtitle: 'متابعة الأبناء والملفات الدراسية',
      icon: Icons.family_restroom_outlined,
      selectedIcon: Icons.family_restroom_rounded,
    ),
    _ShellDestination(
      title: 'خدماتي',
      subtitle: 'المدفوعات والمظهر والحساب',
      icon: Icons.grid_view_outlined,
      selectedIcon: Icons.grid_view_rounded,
    ),
    _ShellDestination(
      title: 'الإعلانات',
      subtitle: 'كل جديد يخص أبناءك',
      icon: Icons.campaign_outlined,
      selectedIcon: Icons.campaign_rounded,
    ),
    _ShellDestination(
      title: 'الرسائل',
      subtitle: 'تواصل مباشر مع المدرسة',
      icon: Icons.chat_bubble_outline_rounded,
      selectedIcon: Icons.chat_bubble_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final destination = _destinations[navigationShell.currentIndex];
    final palette = context.appPalette;

    return AppBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          toolbarHeight: 74,
          titleSpacing: AppSpacing.lg,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(destination.title),
              const SizedBox(height: 2),
              Text(
                destination.subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: palette.mutedText,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          actions: [NotificationBell(), const SizedBox(width: AppSpacing.sm)],
        ),
        body: navigationShell,
        bottomNavigationBar: DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).navigationBarTheme.backgroundColor,
            border: Border(top: BorderSide(color: palette.glassBorder)),
            boxShadow: [
              BoxShadow(
                color: palette.deepShadow.withValues(alpha: 0.42),
                blurRadius: 18,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 80,
              child: AppContentContainer(
                maxWidth: 760,
                child: NavigationBar(
                  selectedIndex: navigationShell.currentIndex,
                  onDestinationSelected: (index) {
                    navigationShell.goBranch(
                      index,
                      initialLocation: index == navigationShell.currentIndex,
                    );
                  },
                  destinations: [
                    for (final item in _destinations)
                      NavigationDestination(
                        icon: Icon(item.icon),
                        selectedIcon: Icon(item.selectedIcon),
                        label: item.title,
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ShellDestination {
  const _ShellDestination({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selectedIcon,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final IconData selectedIcon;
}
