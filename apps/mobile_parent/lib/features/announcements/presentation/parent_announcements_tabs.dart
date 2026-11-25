import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import 'parent_announcements_screen.dart' as activities;

class ParentAnnouncementsScreen extends StatelessWidget {
  const ParentAnnouncementsScreen({super.key, this.announcementId});

  final String? announcementId;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(children: [
        const Material(
          color: Colors.transparent,
          child: TabBar(tabs: [Tab(text: 'الإعلانات'), Tab(text: 'الأنشطة')]),
        ),
        Expanded(child: TabBarView(children: [
          _SchoolAnnouncementsTab(announcementId: announcementId),
          const activities.ParentAnnouncementsScreen(),
        ])),
      ]),
    );
  }
}

class _SchoolAnnouncementsTab extends StatefulWidget {
  const _SchoolAnnouncementsTab({this.announcementId});
  final String? announcementId;
  @override
  State<_SchoolAnnouncementsTab> createState() => _SchoolAnnouncementsTabState();
}

class _SchoolAnnouncementsTabState extends State<_SchoolAnnouncementsTab> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void didUpdateWidget(covariant _SchoolAnnouncementsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.announcementId != widget.announcementId) {
      _future = _load();
    }
  }

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final result = await FirebaseFunctions.instanceFor(region: 'me-central2')
        .httpsCallable('getMyGuardianAnnouncements').call();
    final data = result.data;
    if (data is! Map || data['items'] is! List) {
      throw const FormatException('استجابة الإعلانات غير صالحة');
    }
    return (data['items'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    try { await next; } catch (_) { /* FutureBuilder presents the error. */ }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل الإعلانات...');
        }
        if (snapshot.hasError) {
          return AppErrorState(title: 'تعذر تحميل الإعلانات', message: snapshot.error.toString(), onRetry: _refresh);
        }
        final items = [...?snapshot.data];
        final targetId = widget.announcementId;
        if (targetId != null && targetId.isNotEmpty) {
          final index = items.indexWhere((item) => item['id'] == targetId);
          if (index > 0) items.insert(0, items.removeAt(index));
        }
        if (items.isEmpty) {
          return AppEmptyState(
            icon: Icons.campaign_outlined,
            title: 'لا توجد إعلانات',
            message: 'لا توجد إعلانات متاحة لأبنائك حاليًا.',
            action: OutlinedButton.icon(onPressed: _refresh, icon: const Icon(Icons.refresh), label: const Text('تحديث')),
          );
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) => _AnnouncementCard(item: items[index]),
          ),
        );
      },
    );
  }
}

class _AnnouncementCard extends StatelessWidget {
  const _AnnouncementCard({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final priority = switch (item['priority']) {
      'URGENT' => 'عاجل', 'IMPORTANT' => 'مهم', _ => 'عادي',
    };
    final timestamp = item['publishedAt'];
    final date = timestamp is num ? DateTime.fromMillisecondsSinceEpoch(timestamp.toInt()) : null;
    final image = item['imageUrl'] is String ? item['imageUrl'] as String : '';
    final children = item['children'] is List ? (item['children'] as List).whereType<String>().join('، ') : '';
    final schools = item['schoolNames'] is List ? (item['schoolNames'] as List).whereType<String>().join('، ') : '';
    final attachments = item['attachments'] is List ? item['attachments'] as List : [];
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [Expanded(child: Text('${item['title'] ?? ''}', style: Theme.of(context).textTheme.titleMedium)), Chip(label: Text(priority))]),
      if (image.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Image.network(image, height: 180, fit: BoxFit.contain, errorBuilder: (_, _, _) => const SizedBox.shrink())),
      Text('${item['content'] ?? ''}'),
      const SizedBox(height: 12),
      if (schools.isNotEmpty) Text('المدرسة: $schools'),
      if (children.isNotEmpty) Text('الأبناء: $children'),
      if (date != null) Text('تاريخ النشر: ${date.year}/${date.month}/${date.day}'),
      for (final attachment in attachments.whereType<Map>())
        TextButton.icon(
          onPressed: () async {
            final uri = Uri.tryParse('${attachment['url'] ?? ''}');
            if (uri != null && uri.scheme == 'https') {
              final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
              if (!opened && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذر فتح المرفق')));
            }
          },
          icon: const Icon(Icons.attach_file),
          label: Text(_attachmentLabel(attachment)),
        ),
    ]));
  }
}

String _attachmentLabel(Map attachment) {
  final title = attachment['title'] is String && (attachment['title'] as String).isNotEmpty
      ? attachment['title'] as String
      : 'مرفق';
  final type = attachment['contentType'] is String ? attachment['contentType'] as String : '';
  final size = attachment['sizeBytes'];
  final details = <String>[
    if (type.isNotEmpty) type,
    if (size is num && size > 0) '${(size / 1024 / 1024).toStringAsFixed(2)} MB',
  ];
  return details.isEmpty ? title : '$title (${details.join(' • ')})';
}
