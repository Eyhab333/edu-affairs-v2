import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_learning_loss_service.dart';
import '../models/guardian_learning_loss_plan.dart';

class StudentLearningLossTab extends StatefulWidget {
  const StudentLearningLossTab({super.key, required this.studentId});

  final String studentId;

  @override
  State<StudentLearningLossTab> createState() => _StudentLearningLossTabState();
}

class _StudentLearningLossTabState extends State<StudentLearningLossTab> {
  static const _allSubjects = '__all_subjects__';

  final _service = GuardianLearningLossService();
  late Future<List<GuardianLearningLossPlan>> _future;
  String _selectedSubject = _allSubjects;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<GuardianLearningLossPlan>> _load() =>
      _service.loadStudentLearningLoss(studentId: widget.studentId);

  Future<void> _reload() async {
    final nextFuture = _load();
    setState(() {
      _future = nextFuture;
    });

    try {
      await nextFuture;
    } catch (_) {
      // FutureBuilder owns the visible error state.
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<GuardianLearningLossPlan>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل خطط الفاقد التعليمي...');
        }
        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل الفاقد التعليمي',
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }

        final plans = snapshot.data ?? const <GuardianLearningLossPlan>[];
        if (plans.isEmpty) {
          return AppEmptyState(
            icon: Icons.auto_graph_rounded,
            title: 'لا توجد خطط فاقد تعليمي',
            message: 'لا توجد خطط فاقد تعليمي لهذا الطالب حاليًا.',
            action: OutlinedButton.icon(
              onPressed: _reload,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تحديث'),
            ),
          );
        }

        final subjects = _subjects(plans);
        final selectedSubject = subjects.contains(_selectedSubject)
            ? _selectedSubject
            : _allSubjects;
        final filtered = selectedSubject == _allSubjects
            ? plans
            : plans
                .where((plan) => _subjectValue(plan) == selectedSubject)
                .toList();

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              const _LearningLossHeader(),
              const SizedBox(height: AppSpacing.md),
              _LearningLossSummary(plans: plans),
              const SizedBox(height: AppSpacing.md),
              _SubjectFilter(
                subjects: subjects,
                selected: selectedSubject,
                onChanged: (value) => setState(() => _selectedSubject = value),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (filtered.isEmpty)
                const AppEmptyState(
                  icon: Icons.filter_alt_off_rounded,
                  title: 'لا توجد خطط مطابقة',
                  message: 'غيّر المادة لعرض الخطط الأخرى.',
                )
              else
                for (final plan in filtered)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _LearningLossPlanCard(plan: plan),
                  ),
            ],
          ),
        );
      },
    );
  }

  List<String> _subjects(List<GuardianLearningLossPlan> plans) {
    final subjects = plans
        .map(_subjectValue)
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return [_allSubjects, ...subjects];
  }

  String _subjectValue(GuardianLearningLossPlan plan) =>
      plan.subjectTitle.isNotEmpty ? plan.subjectTitle : plan.subjectKey;
}

class _LearningLossHeader extends StatelessWidget {
  const _LearningLossHeader();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Icon(
            Icons.trending_up_rounded,
            color: theme.colorScheme.primary,
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'الفاقد التعليمي',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                'خطط المعالجة والمتابعة الخاصة بالطالب',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LearningLossSummary extends StatelessWidget {
  const _LearningLossSummary({required this.plans});

  final List<GuardianLearningLossPlan> plans;

  @override
  Widget build(BuildContext context) {
    final active = plans.where((plan) => plan.status == 'ACTIVE').length;
    final improved = plans.where(_isImproved).length;
    final needsFollowUp = plans
        .where((plan) => plan.status == 'ACTIVE' && !_isImproved(plan))
        .length;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          _SummaryMetric(
            label: 'خطط نشطة',
            value: active,
            color: Theme.of(context).colorScheme.primary,
            icon: Icons.assignment_rounded,
          ),
          _SummaryDivider(),
          _SummaryMetric(
            label: 'تحسن',
            value: improved,
            color: Theme.of(context).colorScheme.primary,
            icon: Icons.check_circle_rounded,
          ),
          _SummaryDivider(),
          _SummaryMetric(
            label: 'قيد المتابعة',
            value: needsFollowUp,
            color: context.appPalette.gold,
            icon: Icons.pending_actions_rounded,
          ),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  final String label;
  final int value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(height: 5),
            Text(
              '$value',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ],
        ),
      );
}

class _SummaryDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 1,
        height: 54,
        color: context.appPalette.glassBorder,
      );
}

class _SubjectFilter extends StatelessWidget {
  const _SubjectFilter({
    required this.subjects,
    required this.selected,
    required this.onChanged,
  });

  final List<String> subjects;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            const Icon(Icons.filter_list_rounded),
            const SizedBox(width: AppSpacing.sm),
            const Text('المادة'),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: selected,
                  isExpanded: true,
                  items: [
                    for (final subject in subjects)
                      DropdownMenuItem(
                        value: subject,
                        child: Text(
                          subject == _StudentLearningLossTabState._allSubjects
                              ? 'كل المواد'
                              : subject,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (value) {
                    if (value != null) onChanged(value);
                  },
                ),
              ),
            ),
          ],
        ),
      );
}

class _LearningLossPlanCard extends StatelessWidget {
  const _LearningLossPlanCard({required this.plan});

  final GuardianLearningLossPlan plan;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final improvement = _improvementInfo(context, plan);
    final title = plan.planTitle.isNotEmpty ? plan.planTitle : 'خطة معالجة';
    final subject = plan.subjectTitle.isNotEmpty
        ? plan.subjectTitle
        : (plan.subjectKey.isNotEmpty ? plan.subjectKey : 'مادة غير محددة');

    return AppCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        tilePadding: const EdgeInsets.all(AppSpacing.lg),
        childrenPadding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        iconColor: theme.colorScheme.primary,
        collapsedIconColor: theme.colorScheme.onSurfaceVariant,
        title: Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w900,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _Pill(label: subject, color: theme.colorScheme.primary),
              _Pill(label: improvement.label, color: improvement.color),
            ],
          ),
        ),
        children: [
          if (plan.planText.isNotEmpty) ...[
            _LabelledText(label: 'خطة المعالجة', value: plan.planText),
            const SizedBox(height: AppSpacing.md),
          ],
          _DatesRow(plan: plan),
          if (plan.sourceTitle.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            _LabelledText(label: 'مصدر الخطة', value: plan.sourceTitle),
          ],
          if (plan.lostSkills.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            _DetailsSection(
              icon: Icons.flag_outlined,
              title: 'المهارات المستهدفة',
              child: Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final skill in plan.lostSkills)
                    _SkillChip(skill: skill),
                ],
              ),
            ),
          ],
          if (plan.remediationActions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            _DetailsSection(
              icon: Icons.task_alt_rounded,
              title: 'إجراءات المعالجة',
              child: Column(
                children: [
                  for (final action in plan.remediationActions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: _RemediationActionTile(action: action),
                    ),
                ],
              ),
            ),
          ],
          if (_progressPoints(plan).length >= 2) ...[
            const SizedBox(height: AppSpacing.lg),
            _DetailsSection(
              icon: Icons.show_chart_rounded,
              title: 'تقدم القياسات',
              child: _ProgressChart(plan: plan),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          _ImprovementDetails(plan: plan, info: improvement),
        ],
      ),
    );
  }
}

class _DatesRow extends StatelessWidget {
  const _DatesRow({required this.plan});

  final GuardianLearningLossPlan plan;

  @override
  Widget build(BuildContext context) {
    final values = <String>[
      if (plan.planStartAtMs != null) 'بداية ${_dateLabel(plan.planStartAtMs)}',
      if (plan.planEndAtMs != null) 'نهاية ${_dateLabel(plan.planEndAtMs)}',
      if (plan.lastFollowUpAtMs != null)
        'آخر متابعة ${_dateLabel(plan.lastFollowUpAtMs)}',
    ];
    if (values.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: AppSpacing.md,
      runSpacing: AppSpacing.xs,
      children: [
        for (final value in values)
          Text(
            value,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
          ),
      ],
    );
  }
}

class _DetailsSection extends StatelessWidget {
  const _DetailsSection({
    required this.icon,
    required this.title,
    required this.child,
  });

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 19, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: AppSpacing.xs),
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          child,
        ],
      );
}

class _LabelledText extends StatelessWidget {
  const _LabelledText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.bodyMedium),
        ],
      );
}

class _SkillChip extends StatelessWidget {
  const _SkillChip({required this.skill});

  final GuardianLearningLossSkill skill;

  @override
  Widget build(BuildContext context) {
    final label = skill.title.isNotEmpty ? skill.title : skill.description;
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.22),
        ),
      ),
      child: Text(label, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}

class _RemediationActionTile extends StatelessWidget {
  const _RemediationActionTile({required this.action});

  final GuardianRemediationAction action;

  @override
  Widget build(BuildContext context) {
    final completed = action.completedAtMs != null || action.status == 'COMPLETED';
    final color = completed
        ? Theme.of(context).colorScheme.primary
        : context.appPalette.gold;
    final title = action.title.isNotEmpty ? action.title : 'إجراء معالجة';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            completed ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            size: 20,
            color: color,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                if (action.description.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    action.description,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
                if (_actionStatusLabel(action.status).isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    _actionStatusLabel(action.status),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ],
                if (action.completedAtMs != null || action.dueAtMs != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    action.completedAtMs != null
                        ? 'تمت ${_dateLabel(action.completedAtMs)}'
                        : 'الموعد ${_dateLabel(action.dueAtMs)}',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ImprovementDetails extends StatelessWidget {
  const _ImprovementDetails({required this.plan, required this.info});

  final GuardianLearningLossPlan plan;
  final _ImprovementInfo info;

  @override
  Widget build(BuildContext context) {
    final values = <Widget>[
      _Pill(label: info.label, color: info.color),
      if (plan.improvementDelta != null)
        _Pill(
          label: 'فرق ${_formatNumber(plan.improvementDelta!)}',
          color: info.color,
        ),
      if (plan.improvementPercentage != null)
        _Pill(
          label: '${_formatNumber(plan.improvementPercentage!)}% تحسن',
          color: info.color,
        ),
    ];

    return Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: values);
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.11),
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w900,
              ),
        ),
      );
}

class _ProgressChart extends StatelessWidget {
  const _ProgressChart({required this.plan});

  final GuardianLearningLossPlan plan;

  @override
  Widget build(BuildContext context) {
    final points = _progressPoints(plan);
    final primary = Theme.of(context).colorScheme.primary;
    final gold = context.appPalette.gold;
    final labels = points.map((point) => point.label).toList();

    return Column(
      children: [
        SizedBox(
          height: 165,
          child: LineChart(
            LineChartData(
              minY: 0,
              maxY: 100,
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: 25,
                getDrawingHorizontalLine: (value) => FlLine(
                  color: context.appPalette.glassBorder,
                  strokeWidth: 1,
                ),
              ),
              titlesData: const FlTitlesData(show: false),
              borderData: FlBorderData(show: false),
              lineTouchData: LineTouchData(
                touchTooltipData: LineTouchTooltipData(
                  getTooltipItems: (items) => items.map((item) {
                    final point = points[item.x.toInt()];
                    return LineTooltipItem(
                      '${point.label}\n${point.value.toStringAsFixed(0)}%',
                      TextStyle(color: Theme.of(context).colorScheme.onInverseSurface),
                    );
                  }).toList(),
                ),
              ),
              lineBarsData: [
                LineChartBarData(
                  spots: [
                    for (var index = 0; index < points.length; index++)
                      FlSpot(index.toDouble(), points[index].value),
                  ],
                  isCurved: true,
                  color: primary,
                  barWidth: 3,
                  dotData: FlDotData(
                    show: true,
                    getDotPainter: (spot, percent, barData, index) =>
                        FlDotCirclePainter(
                      radius: 4,
                      color: spot.x == points.length - 1 ? gold : primary,
                      strokeColor: Theme.of(context).colorScheme.surface,
                      strokeWidth: 2,
                    ),
                  ),
                  belowBarData: BarAreaData(
                    show: true,
                    color: primary.withValues(alpha: 0.08),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Row(
          children: [
            for (final label in labels)
              Expanded(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _ProgressPoint {
  const _ProgressPoint({required this.label, required this.value});

  final String label;
  final double value;
}

class _ImprovementInfo {
  const _ImprovementInfo({required this.label, required this.color});

  final String label;
  final Color color;
}

bool _isImproved(GuardianLearningLossPlan plan) =>
    plan.improvementIndicator == 'IMPROVED' || plan.status == 'IMPROVED';

_ImprovementInfo _improvementInfo(
  BuildContext context,
  GuardianLearningLossPlan plan,
) {
  final value = plan.improvementIndicator.isNotEmpty &&
          plan.improvementIndicator != 'UNKNOWN'
      ? plan.improvementIndicator
      : plan.status;
  switch (value) {
    case 'IMPROVED':
      return _ImprovementInfo(
        label: 'تحسن',
        color: Theme.of(context).colorScheme.primary,
      );
    case 'PARTIALLY_IMPROVED':
      return _ImprovementInfo(label: 'تحسن جزئي', color: context.appPalette.gold);
    case 'NOT_IMPROVED':
      return _ImprovementInfo(
        label: 'يحتاج إلى متابعة',
        color: Theme.of(context).colorScheme.error,
      );
    case 'COMPLETED':
      return _ImprovementInfo(
        label: 'اكتملت الخطة',
        color: Theme.of(context).colorScheme.primary,
      );
    default:
      return _ImprovementInfo(label: 'قيد المتابعة', color: context.appPalette.gold);
  }
}

List<_ProgressPoint> _progressPoints(GuardianLearningLossPlan plan) {
  final values = <_ProgressPoint>[];
  void add(String label, num? score, num? maxScore) {
    if (score == null || maxScore == null || maxScore <= 0) return;
    values.add(_ProgressPoint(label: label, value: (score / maxScore) * 100));
  }

  add('الأساسي', plan.baselineScore, plan.baselineMaxScore);
  add('الأولى', plan.firstCheckScore, plan.firstCheckMaxScore);
  add('الثانية', plan.secondCheckScore, plan.secondCheckMaxScore);
  return values;
}

String _dateLabel(int? milliseconds) {
  if (milliseconds == null || milliseconds <= 0) return '';
  final date = DateTime.fromMillisecondsSinceEpoch(milliseconds);
  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}

String _formatNumber(num value) {
  return value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toStringAsFixed(1);
}

String _actionStatusLabel(String status) {
  switch (status) {
    case 'COMPLETED':
      return 'مكتمل';
    case 'IN_PROGRESS':
    case 'ACTIVE':
      return 'قيد التنفيذ';
    case 'PENDING':
      return 'قيد الانتظار';
    default:
      return '';
  }
}
