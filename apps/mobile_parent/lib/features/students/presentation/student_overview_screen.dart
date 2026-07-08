import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_info_row.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../../attendance/presentation/student_attendance_tab.dart';
import '../../guardian/data/guardian_children_service.dart';
import '../../guardian/models/parent_student_summary.dart';
import '../../notes/presentation/student_notes_tab.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';

class StudentOverviewScreen extends StatefulWidget {
  const StudentOverviewScreen({super.key, required this.studentId});

  final String studentId;

  @override
  State<StudentOverviewScreen> createState() => _StudentOverviewScreenState();
}

class _StudentOverviewScreenState extends State<StudentOverviewScreen> {
  late Future<ParentStudentSummary?> _future;

  final _service = GuardianChildrenService();

  @override
  void initState() {
    super.initState();
    _future = _loadStudent();
  }

  Future<ParentStudentSummary?> _loadStudent() async {
    final children = await _service.loadMyChildren();

    for (final child in children) {
      if (child.studentId == widget.studentId) {
        return child;
      }
    }

    return null;
  }

  void _reload() {
    setState(() {
      _future = _loadStudent();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ParentStudentSummary?>(
      future: _future,
      builder: (context, snapshot) {
        final student = snapshot.data;

        return Scaffold(
          appBar: AppBar(
            title: Text(student?.studentName ?? 'ملف الطالب'),
            leading: IconButton(
              onPressed: () => context.go('/children'),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            actions: [
              IconButton(
                tooltip: 'تحديث',
                onPressed: _reload,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
          body: SafeArea(child: _buildBody(context, snapshot)),
        );
      },
    );
  }

  Widget _buildBody(
    BuildContext context,
    AsyncSnapshot<ParentStudentSummary?> snapshot,
  ) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const AppLoadingState(message: 'جاري تحميل بيانات الطالب...');
    }

    if (snapshot.hasError) {
      return AppErrorState(
        title: 'تعذر تحميل بيانات الطالب',
        message: snapshot.error.toString(),
        onRetry: _reload,
      );
    }

    final student = snapshot.data;

    if (student == null) {
      return AppEmptyState(
        icon: Icons.lock_outline_rounded,
        title: 'لا يمكن فتح هذا الطالب',
        message: 'هذا الطالب غير مرتبط بحساب ولي الأمر الحالي.',
        action: OutlinedButton.icon(
          onPressed: () => context.go('/children'),
          icon: const Icon(Icons.arrow_back_rounded),
          label: const Text('العودة إلى أبنائي'),
        ),
      );
    }

    return DefaultTabController(
      length: 6,
      child: Column(
        children: [
          _StudentHeader(
            student: student,
            onCommunicationPressed: () {
              context.push(
                '/students/${Uri.encodeComponent(student.studentId)}/communication',
              );
            },
            onActivitiesPressed: () {
              context.push(
                '/students/${Uri.encodeComponent(student.studentId)}/activities',
              );
            },
          ),

          const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'الملخص'),
              Tab(text: 'الحضور'),
              Tab(text: 'الملاحظات'),
              Tab(text: 'التحفيز'),
              Tab(text: 'القياسات'),
              Tab(text: 'الحصص الافتراضية'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _SummaryTab(student: student),
                StudentAttendanceTab(studentId: student.studentId),
                StudentNotesTab(studentId: student.studentId),
                const _PlaceholderTab(
                  icon: Icons.emoji_events_rounded,
                  title: 'التحفيز',
                  message: 'سنظهر هنا نقاط وشارات وأحداث التحفيز.',
                ),
                const _PlaceholderTab(
                  icon: Icons.analytics_rounded,
                  title: 'القياسات',
                  message: 'سنظهر هنا نتائج القياسات والمتابعات المختصرة.',
                ),
                StudentVirtualClassesTab(student: student),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentHeader extends StatelessWidget {
  const _StudentHeader({
    required this.student,
    required this.onCommunicationPressed,
    required this.onActivitiesPressed,
  });

  final ParentStudentSummary student;
  final VoidCallback onCommunicationPressed;
  final VoidCallback onActivitiesPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 62,
                  height: 62,
                  decoration: BoxDecoration(
                    color: colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                  ),
                  child: Icon(
                    Icons.child_care_rounded,
                    color: colorScheme.primary,
                    size: 34,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        student.studentName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.titleLarge?.copyWith(
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
                        style: textTheme.bodyMedium?.copyWith(
                          color: AppColors.text,
                        ),
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
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.soft,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    student.relationLabel,
                    style: textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),

            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onActivitiesPressed,
                    icon: const Icon(Icons.emoji_events_rounded),
                    label: const Text('الأنشطة'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onCommunicationPressed,
                    icon: const Icon(Icons.forum_rounded),
                    label: const Text('التواصل'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryTab extends StatelessWidget {
  const _SummaryTab({required this.student});

  final ParentStudentSummary student;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppCard(
          child: Column(
            children: [
              const AppSectionTitle(
                title: 'بيانات الطالب',
                icon: Icons.badge_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              AppInfoRow(label: 'الاسم', value: student.studentName),
              AppInfoRow(label: 'صلة القرابة', value: student.relationLabel),
              AppInfoRow(
                label: 'المدرسة',
                value: student.schoolName.isEmpty
                    ? 'غير محددة'
                    : student.schoolName,
              ),
              AppInfoRow(
                label: 'السنة الدراسية',
                value: student.academicYearTitle.isEmpty
                    ? 'غير محددة'
                    : student.academicYearTitle,
              ),
              AppInfoRow(
                label: 'الصف / المستوى',
                value: student.gradeTitle.isEmpty
                    ? 'غير محدد'
                    : student.gradeTitle,
              ),
              AppInfoRow(
                label: 'الفصل',
                value: student.classTitle.isEmpty
                    ? 'غير محدد'
                    : student.classTitle,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const AppCard(
          child: Column(
            children: [
              AppSectionTitle(
                title: 'لمحة سريعة',
                subtitle: 'سيتم ربط هذه البيانات تدريجيًا في المراحل القادمة.',
                icon: Icons.insights_rounded,
              ),
              SizedBox(height: AppSpacing.md),
              AppInfoRow(label: 'آخر حضور', value: 'يظهر في تبويب الحضور'),
              AppInfoRow(label: 'آخر ملاحظة', value: 'تظهر في تبويب الملاحظات'),
              AppInfoRow(label: 'آخر تحفيز', value: 'سيظهر لاحقًا'),
              AppInfoRow(label: 'آخر قياس', value: 'سيظهر لاحقًا'),
            ],
          ),
        ),
      ],
    );
  }
}

class StudentVirtualClassesTab extends StatefulWidget {
  const StudentVirtualClassesTab({super.key, required this.student});

  final ParentStudentSummary student;

  @override
  State<StudentVirtualClassesTab> createState() =>
      _StudentVirtualClassesTabState();
}

class _StudentVirtualClassesTabState extends State<StudentVirtualClassesTab> {
  late Future<List<_VirtualClassBundle>> _future;

  final _firestore = FirebaseFirestore.instance;

  @override
  void initState() {
    super.initState();
    _future = _loadVirtualClasses();
  }

  void _reload() {
    setState(() {
      _future = _loadVirtualClasses();
    });
  }

  Future<List<_VirtualClassBundle>> _loadVirtualClasses() async {
    final orgId = widget.student.orgId;
    final studentId = widget.student.studentId;

    if (orgId.isEmpty || studentId.isEmpty) {
      return [];
    }

    final participantsSnap = await _firestore
        .collection('orgs/$orgId/virtualClassParticipants')
        .where('studentId', isEqualTo: studentId)
        .get();

    final bundles = <_VirtualClassBundle>[];

    for (final participantDoc in participantsSnap.docs) {
      final participant = _VirtualClassParticipant.fromDoc(participantDoc);

      if (participant.sessionId.isEmpty) {
        continue;
      }

      final sessionDoc = await _firestore
          .doc('orgs/$orgId/virtualClassSessions/${participant.sessionId}')
          .get();

      if (!sessionDoc.exists || sessionDoc.data() == null) {
        continue;
      }

      final session = _VirtualClassSession.fromDoc(sessionDoc);

      if (session.isArchived) {
        continue;
      }

      if (session.schoolId != widget.student.schoolId) {
        continue;
      }

      if (session.academicYearId != widget.student.academicYearId) {
        continue;
      }

      if (session.classId != widget.student.classId) {
        continue;
      }

      bundles.add(
        _VirtualClassBundle(session: session, participant: participant),
      );
    }

    bundles.sort((a, b) {
      final aStart = a.session.startsAt ?? 0;
      final bStart = b.session.startsAt ?? 0;
      return aStart.compareTo(bStart);
    });

    return bundles;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<_VirtualClassBundle>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(
            message: 'جاري تحميل الحصص الافتراضية...',
          );
        }

        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل الحصص الافتراضية',
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }

        final items = snapshot.data ?? [];

        if (items.isEmpty) {
          return AppEmptyState(
            icon: Icons.video_call_outlined,
            title: 'لا توجد حصص افتراضية',
            message: 'لا توجد حصص Google Meet مجدولة لهذا الطالب حاليًا.',
            action: OutlinedButton.icon(
              onPressed: _reload,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تحديث'),
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final bundle = items[index];

              return _VirtualClassCard(
                student: widget.student,
                bundle: bundle,
                onRefresh: _reload,
              );
            },
          ),
        );
      },
    );
  }
}

class _VirtualClassCard extends StatefulWidget {
  const _VirtualClassCard({
    required this.student,
    required this.bundle,
    required this.onRefresh,
  });

  final ParentStudentSummary student;
  final _VirtualClassBundle bundle;
  final VoidCallback onRefresh;

  @override
  State<_VirtualClassCard> createState() => _VirtualClassCardState();
}

class _VirtualClassCardState extends State<_VirtualClassCard> {
  bool _joining = false;
  @override
  Widget build(BuildContext context) {
    final session = widget.bundle.session;
    final participant = widget.bundle.participant;
    final student = widget.student;

    Future<void> _joinVirtualClass() async {
      final session = widget.bundle.session;
      final participant = widget.bundle.participant;
      final student = widget.student;

      final joinUrl = session.joinUrl.trim();

      if (joinUrl.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('رابط الحصة غير متوفر حاليًا.')),
        );
        return;
      }

      final uri = Uri.tryParse(joinUrl);

      if (uri == null || !uri.hasScheme) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('رابط Google Meet غير صحيح.')),
        );
        return;
      }

      setState(() {
        _joining = true;
      });

      try {
        final now = DateTime.now().millisecondsSinceEpoch;
        final guardianUid = FirebaseAuth.instance.currentUser?.uid ?? '';

        await FirebaseFirestore.instance
            .doc(
              'orgs/${student.orgId}/virtualClassParticipants/${participant.id}',
            )
            .update({
              'platformJoinStatus': 'JOIN_CLICKED',
              'joinClickedAt': now,

              // مؤقتًا نخزن uid في الحقل القديم للتوافق
              'joinClickedByGuardianId': guardianUid,

              // الحقل الصحيح لقواعد Firestore
              'joinClickedByGuardianUid': guardianUid,

              'updatedAt': now,
            });

        widget.onRefresh();

        final launched = await launchUrl(
          uri,
          mode: LaunchMode.externalApplication,
        );

        if (!launched && mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('تعذر فتح رابط الحصة.')));
        }
      } catch (error) {
        if (!mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر تسجيل الدخول للحصة: $error')),
        );
      } finally {
        if (mounted) {
          setState(() {
            _joining = false;
          });
        }
      }
    }

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(child: Icon(Icons.video_call_rounded)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        session.title.isEmpty ? 'حصة افتراضية' : session.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        session.subjectTitle.isEmpty
                            ? session.subjectKey
                            : session.subjectTitle,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                _StatusChip(label: _sessionStatusLabel(session.status)),
              ],
            ),
            const SizedBox(height: 16),
            _InfoRow(
              icon: Icons.schedule_rounded,
              label: 'البداية',
              value: _formatDateTime(session.startsAt),
            ),
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.timer_outlined,
              label: 'النهاية',
              value: _formatDateTime(session.endsAt),
            ),
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.fact_check_outlined,
              label: 'حالة الدخول',
              value: _attendanceStatusLabel(participant.platformJoinStatus),
            ),
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.verified_outlined,
              label: 'الحضور النهائي',
              value: _attendanceStatusLabel(participant.finalAttendanceStatus),
            ),
            if (participant.joinClickedAt != null) ...[
              const SizedBox(height: 8),
              _InfoRow(
                icon: Icons.login_rounded,
                label: 'وقت الضغط على الدخول',
                value: _formatDateTime(participant.joinClickedAt),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _joining ? null : _joinVirtualClass,
                    icon: _joining
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.video_call_rounded),
                    label: Text(
                      _joining
                          ? 'جاري فتح الحصة...'
                          : 'دخول الحصة كـ ${student.studentName}',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.outlined(
                  tooltip: 'تحديث الحالة',
                  onPressed: widget.onRefresh,
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(label: Text(label), visualDensity: VisualDensity.compact);
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        SizedBox(width: 110, child: Text(label, style: textTheme.bodySmall)),
        Expanded(
          child: Text(
            value,
            style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _VirtualClassBundle {
  const _VirtualClassBundle({required this.session, required this.participant});

  final _VirtualClassSession session;
  final _VirtualClassParticipant participant;
}

class _VirtualClassSession {
  const _VirtualClassSession({
    required this.id,
    required this.schoolId,
    required this.academicYearId,
    required this.classId,
    required this.subjectKey,
    required this.subjectTitle,
    required this.title,
    required this.status,
    required this.joinUrl,
    required this.startsAt,
    required this.endsAt,
    required this.isArchived,
  });

  final String id;
  final String schoolId;
  final String academicYearId;
  final String classId;
  final String subjectKey;
  final String subjectTitle;
  final String title;
  final String status;
  final String joinUrl;
  final int? startsAt;
  final int? endsAt;
  final bool isArchived;

  factory _VirtualClassSession.fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};

    return _VirtualClassSession(
      id: doc.id,
      schoolId: _readString(data, 'schoolId'),
      academicYearId: _readString(data, 'academicYearId'),
      classId: _readString(data, 'classId'),
      subjectKey: _readString(data, 'subjectKey'),
      subjectTitle: _readString(data, 'subjectTitle'),
      title: _readString(data, 'title'),
      status: _readString(data, 'status'),
      joinUrl: _readString(data, 'joinUrl'),
      startsAt: _readInt(data, 'startsAt'),
      endsAt: _readInt(data, 'endsAt'),
      isArchived: data['isArchived'] == true,
    );
  }
}

class _VirtualClassParticipant {
  const _VirtualClassParticipant({
    required this.id,
    required this.sessionId,
    required this.platformJoinStatus,
    required this.providerAttendanceStatus,
    required this.finalAttendanceStatus,
    required this.joinClickedAt,
  });

  final String id;
  final String sessionId;
  final String platformJoinStatus;
  final String providerAttendanceStatus;
  final String finalAttendanceStatus;
  final int? joinClickedAt;

  factory _VirtualClassParticipant.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();

    return _VirtualClassParticipant(
      id: doc.id,
      sessionId: _readString(data, 'sessionId'),
      platformJoinStatus: _readString(data, 'platformJoinStatus'),
      providerAttendanceStatus: _readString(data, 'providerAttendanceStatus'),
      finalAttendanceStatus: _readString(data, 'finalAttendanceStatus'),
      joinClickedAt: _readInt(data, 'joinClickedAt'),
    );
  }
}

String _readString(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is String) return value.trim();
  return '';
}

int? _readInt(Map<String, dynamic> data, String key) {
  final value = data[key];

  if (value is int) return value;
  if (value is num) return value.toInt();

  return null;
}

String _formatDateTime(int? value) {
  if (value == null || value <= 0) {
    return 'غير محدد';
  }

  final date = DateTime.fromMillisecondsSinceEpoch(value);

  final dateText =
      '${date.year}/${_twoDigits(date.month)}/${_twoDigits(date.day)}';
  final timeText = '${_twoDigits(date.hour)}:${_twoDigits(date.minute)}';

  return '$dateText - $timeText';
}

String _twoDigits(int value) {
  return value.toString().padLeft(2, '0');
}

String _sessionStatusLabel(String status) {
  switch (status) {
    case 'DRAFT':
      return 'مسودة';
    case 'SCHEDULED':
      return 'مجدولة';
    case 'LIVE':
      return 'مباشرة';
    case 'ENDED':
      return 'منتهية';
    case 'ATTENDANCE_IMPORTED':
      return 'تم جلب الحضور';
    case 'ATTENDANCE_REVIEWED':
      return 'تم اعتماد الحضور';
    case 'CANCELLED':
      return 'ملغاة';
    default:
      return status.isEmpty ? 'غير محدد' : status;
  }
}

String _attendanceStatusLabel(String status) {
  switch (status) {
    case 'SCHEDULED':
      return 'مجدول';
    case 'JOIN_CLICKED':
      return 'ضغط دخول';
    case 'ATTENDED':
      return 'حاضر';
    case 'LATE':
      return 'متأخر';
    case 'LEFT_EARLY':
      return 'خرج مبكرًا';
    case 'ABSENT':
      return 'غائب';
    case 'EXCUSED':
      return 'بعذر';
    case 'UNKNOWN':
      return 'غير معروف';
    default:
      return status.isEmpty ? 'غير معروف' : status;
  }
}

class _PlaceholderTab extends StatelessWidget {
  const _PlaceholderTab({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return AppEmptyState(
      icon: icon,
      title: title,
      message: message,
      maxWidth: 480,
    );
  }
}
