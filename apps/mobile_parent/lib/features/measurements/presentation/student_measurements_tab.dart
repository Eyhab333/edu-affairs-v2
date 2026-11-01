import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/student_measurements_service.dart';
import '../models/student_measurement_item.dart';

enum _MeasurementMode { all, core, compensation }

class StudentMeasurementsTab extends StatefulWidget {
  const StudentMeasurementsTab({super.key, required this.studentId});

  final String studentId;

  @override
  State<StudentMeasurementsTab> createState() => _StudentMeasurementsTabState();
}

class _StudentMeasurementsTabState extends State<StudentMeasurementsTab> {
  static const _allSubjects = '__all_subjects__';

  final StudentMeasurementsService _service = StudentMeasurementsService();
  late Future<List<StudentMeasurementItem>> _future;
  String _selectedSubject = _allSubjects;
  _MeasurementMode _selectedMode = _MeasurementMode.all;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<StudentMeasurementItem>> _load() {
    return _service.loadStudentMeasurements(studentId: widget.studentId);
  }

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
    return FutureBuilder<List<StudentMeasurementItem>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const AppLoadingState(message: 'جاري تحميل القياسات...');
        }
        if (snapshot.hasError) {
          return AppErrorState(
            title: 'تعذر تحميل القياسات',
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }

        final measurements = snapshot.data ?? const <StudentMeasurementItem>[];
        if (measurements.isEmpty) {
          return AppEmptyState(
            icon: Icons.analytics_outlined,
            title: 'لا توجد قياسات معتمدة',
            message: 'ستظهر هنا القياسات المكتملة بعد اعتمادها من المدرسة.',
            action: OutlinedButton.icon(
              onPressed: _reload,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('تحديث'),
            ),
          );
        }

        final subjects = _subjectsFrom(measurements);
        final selectedSubject = subjects.contains(_selectedSubject)
            ? _selectedSubject
            : _allSubjects;
        final filtered = _filterMeasurements(
          measurements,
          selectedSubject: selectedSubject,
          mode: _selectedMode,
        );

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              _MeasurementsHeader(count: filtered.length),
              const SizedBox(height: AppSpacing.md),
              _MeasurementFilters(
                subjects: subjects,
                selectedSubject: selectedSubject,
                selectedMode: _selectedMode,
                onSubjectChanged: (value) {
                  if (value == null) return;
                  setState(() => _selectedSubject = value);
                },
                onModeChanged: (value) {
                  setState(() => _selectedMode = value);
                },
              ),
              if (filtered.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                _MeasurementSummary(measurements: filtered),
                const SizedBox(height: AppSpacing.md),
                _MeasurementChart(
                  measurements: filtered,
                  selectedSubject: selectedSubject,
                ),
              ],
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xl),
                  child: AppEmptyState(
                    icon: Icons.filter_alt_off_rounded,
                    title: 'لا توجد نتائج مطابقة',
                    message: 'غيّر المادة أو نوع القياس لعرض نتائج أخرى.',
                  ),
                )
              else ...[
                const SizedBox(height: AppSpacing.md),
                for (final measurement in filtered)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _MeasurementCard(measurement: measurement),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }

  List<String> _subjectsFrom(List<StudentMeasurementItem> measurements) {
    final values = measurements
        .map(_measurementSubject)
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return [_allSubjects, ...values];
  }

  List<StudentMeasurementItem> _filterMeasurements(
    List<StudentMeasurementItem> measurements, {
    required String selectedSubject,
    required _MeasurementMode mode,
  }) {
    final filtered = measurements.where((measurement) {
      if (selectedSubject != _allSubjects &&
          _measurementSubject(measurement) != selectedSubject) {
        return false;
      }
      return switch (mode) {
        _MeasurementMode.all => true,
        _MeasurementMode.core => !measurement.isCompensation,
        _MeasurementMode.compensation => measurement.isCompensation,
      };
    }).toList();

    filtered.sort((a, b) => (b.dateMs ?? 0).compareTo(a.dateMs ?? 0));
    return filtered;
  }
}

class _MeasurementsHeader extends StatelessWidget {
  const _MeasurementsHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: Icon(
            Icons.analytics_rounded,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'القياسات',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                'النتائج المكتملة والمعتمدة فقط',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(
            '$count قياس',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _MeasurementFilters extends StatelessWidget {
  const _MeasurementFilters({
    required this.subjects,
    required this.selectedSubject,
    required this.selectedMode,
    required this.onSubjectChanged,
    required this.onModeChanged,
  });

  final List<String> subjects;
  final String selectedSubject;
  final _MeasurementMode selectedMode;
  final ValueChanged<String?> onSubjectChanged;
  final ValueChanged<_MeasurementMode> onModeChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'تصفية النتائج',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: selectedSubject,
            decoration: const InputDecoration(
              labelText: 'المادة',
              prefixIcon: Icon(Icons.menu_book_rounded),
            ),
            items: subjects
                .map(
                  (subject) => DropdownMenuItem(
                    value: subject,
                    child: Text(
                      subject == _StudentMeasurementsTabState._allSubjects
                          ? 'كل المواد'
                          : subject,
                    ),
                  ),
                )
                .toList(),
            onChanged: onSubjectChanged,
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _ModeChip(
                label: 'الكل',
                selected: selectedMode == _MeasurementMode.all,
                onSelected: () => onModeChanged(_MeasurementMode.all),
              ),
              _ModeChip(
                label: 'القياسات الأساسية',
                selected: selectedMode == _MeasurementMode.core,
                onSelected: () => onModeChanged(_MeasurementMode.core),
              ),
              _ModeChip(
                label: 'التعويضية',
                selected: selectedMode == _MeasurementMode.compensation,
                onSelected: () => onModeChanged(_MeasurementMode.compensation),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
      avatar: selected ? const Icon(Icons.check_rounded, size: 17) : null,
    );
  }
}

class _MeasurementSummary extends StatelessWidget {
  const _MeasurementSummary({required this.measurements});

  final List<StudentMeasurementItem> measurements;

  @override
  Widget build(BuildContext context) {
    final numeric = measurements.where(_hasValidPercentage).toList()
      ..sort((a, b) => (b.dateMs ?? 0).compareTo(a.dateMs ?? 0));
    if (numeric.isEmpty) return const SizedBox.shrink();

    final datedNumeric = numeric.where(_hasDatedPercentage).toList();
    final average = numeric
            .map((item) => item.percentage!.toDouble())
            .reduce((a, b) => a + b) /
        numeric.length;
    final latest = datedNumeric.isEmpty
        ? null
        : datedNumeric.first.percentage!.toDouble();

    return Row(
      children: [
        if (latest != null) ...[
          Expanded(
            child: _SummaryValue(
              label: 'أحدث نتيجة',
              value: _percent(latest),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
        ],
        Expanded(child: _SummaryValue(label: 'متوسط النسبة', value: _percent(average))),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _SummaryValue(
            label: 'قياسات رقمية',
            value: numeric.length.toString(),
          ),
        ),
      ],
    );
  }
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _MeasurementChart extends StatelessWidget {
  const _MeasurementChart({
    required this.measurements,
    required this.selectedSubject,
  });

  final List<StudentMeasurementItem> measurements;
  final String selectedSubject;

  @override
  Widget build(BuildContext context) {
    if (selectedSubject == _StudentMeasurementsTabState._allSubjects) {
      final latestBySubject = <String, StudentMeasurementItem>{};
      final chronological = measurements.where(_hasDatedPercentage).toList()
        ..sort((a, b) => (b.dateMs ?? 0).compareTo(a.dateMs ?? 0));
      for (final measurement in chronological) {
        final subject = _measurementSubject(measurement);
        if (subject.isNotEmpty) latestBySubject.putIfAbsent(subject, () => measurement);
      }
      if (latestBySubject.length < 2) return const SizedBox.shrink();
      final entries = latestBySubject.entries.toList()
        ..sort((a, b) => a.key.compareTo(b.key));
      return _BarMeasurementsChart(entries: entries);
    }

    final chronological = measurements.where(_hasDatedPercentage).toList()
      ..sort((a, b) => (a.dateMs ?? 0).compareTo(b.dateMs ?? 0));
    if (chronological.length < 2) return const SizedBox.shrink();
    return _LineMeasurementsChart(measurements: chronological);
  }
}

class _LineMeasurementsChart extends StatelessWidget {
  const _LineMeasurementsChart({required this.measurements});

  final List<StudentMeasurementItem> measurements;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = context.appPalette;
    final spots = [
      for (var index = 0; index < measurements.length; index++)
        FlSpot(index.toDouble(), measurements[index].percentage!.toDouble()),
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _ChartTitle(
            title: 'تطور النتيجة',
            subtitle: 'التسلسل الزمني للنسب المسجلة',
          ),
          const SizedBox(height: AppSpacing.lg),
          SizedBox(
            height: 230,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: LineChart(
                LineChartData(
                  minY: 0,
                  maxY: 100,
                  minX: 0,
                  maxX: (spots.length - 1).toDouble(),
                  gridData: FlGridData(
                    horizontalInterval: 25,
                    verticalInterval: 1,
                    getDrawingHorizontalLine: (_) => FlLine(
                      color: scheme.outlineVariant.withValues(alpha: 0.55),
                      strokeWidth: 1,
                    ),
                    getDrawingVerticalLine: (_) => FlLine(
                      color: scheme.outlineVariant.withValues(alpha: 0.25),
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: _chartTitles(context, measurements),
                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipColor: (_) => scheme.inverseSurface,
                      getTooltipItems: (spots) => spots.map((spot) {
                        final item = measurements[spot.x.round()];
                        return LineTooltipItem(
                          '${item.dateLabel.isEmpty ? 'بدون تاريخ' : item.dateLabel}\n${_percent(spot.y)}',
                          TextStyle(
                            color: scheme.onInverseSurface,
                            fontWeight: FontWeight.w800,
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      color: scheme.primary,
                      barWidth: 3,
                      isStrokeCapRound: true,
                      dotData: FlDotData(
                        getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                          radius: 4,
                          color: spot.x == spots.last.x ? palette.gold : scheme.primary,
                          strokeWidth: 2,
                          strokeColor: scheme.surface,
                        ),
                      ),
                      belowBarData: BarAreaData(
                        show: true,
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            scheme.primary.withValues(alpha: 0.22),
                            scheme.primary.withValues(alpha: 0.01),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BarMeasurementsChart extends StatelessWidget {
  const _BarMeasurementsChart({required this.entries});

  final List<MapEntry<String, StudentMeasurementItem>> entries;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = context.appPalette;
    final highestPercentage = entries
        .map((entry) => entry.value.percentage!.toDouble())
        .reduce((a, b) => a > b ? a : b);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _ChartTitle(
            title: 'مقارنة المواد',
            subtitle: 'أحدث نسبة رقمية مسجلة لكل مادة',
          ),
          const SizedBox(height: AppSpacing.lg),
          LayoutBuilder(
            builder: (context, constraints) {
              final chartWidth = math.max(
                constraints.maxWidth,
                entries.length * 72.0,
              );
              return SizedBox(
                height: 240,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: chartWidth,
                    child: Directionality(
                      textDirection: TextDirection.ltr,
                      child: BarChart(
                BarChartData(
                  minY: 0,
                  maxY: 100,
                  alignment: BarChartAlignment.spaceAround,
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    horizontalInterval: 25,
                    getDrawingHorizontalLine: (_) => FlLine(
                      color: scheme.outlineVariant.withValues(alpha: 0.55),
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: 25,
                        reservedSize: 38,
                        getTitlesWidget: (value, meta) => Text(
                          '${value.toInt()}%',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 42,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index < 0 || index >= entries.length) {
                            return const SizedBox.shrink();
                          }
                          final label = entries[index].key;
                          return SideTitleWidget(
                            meta: meta,
                            space: 8,
                            child: SizedBox(
                              width: 62,
                              child: Text(
                                label,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(color: scheme.onSurfaceVariant),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  barTouchData: BarTouchData(
                    touchTooltipData: BarTouchTooltipData(
                      getTooltipColor: (_) => scheme.inverseSurface,
                      getTooltipItem: (group, groupIndex, rod, rodIndex) {
                        final entry = entries[group.x.toInt()];
                        return BarTooltipItem(
                          '${entry.key}\n${_percent(rod.toY)}',
                          TextStyle(
                            color: scheme.onInverseSurface,
                            fontWeight: FontWeight.w800,
                          ),
                        );
                      },
                    ),
                  ),
                  barGroups: [
                    for (var index = 0; index < entries.length; index++)
                      BarChartGroupData(
                        x: index,
                        barRods: [
                          BarChartRodData(
                            toY: entries[index].value.percentage!.toDouble(),
                            width: 18,
                            color: entries[index].value.percentage!.toDouble() ==
                                    highestPercentage
                                ? palette.gold
                                : scheme.primary,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(6),
                            ),
                          ),
                        ],
                      ),
                  ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ChartTitle extends StatelessWidget {
  const _ChartTitle({required this.title, required this.subtitle});

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

class _MeasurementCard extends StatelessWidget {
  const _MeasurementCard({required this.measurement});

  final StudentMeasurementItem measurement;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Icon(
                  Icons.query_stats_rounded,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      measurement.displayTitle,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        if (_measurementSubject(measurement).isNotEmpty)
                          _measurementSubject(measurement),
                        if (measurement.dateLabel.isNotEmpty)
                          measurement.dateLabel,
                      ].join(' • '),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (measurement.isCompensation)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: context.appPalette.gold.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                  child: Text(
                    'تعويضي',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: context.appPalette.gold,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
            ],
          ),
          if (measurement.scoreLabel.isNotEmpty ||
              measurement.percentageLabel.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                if (measurement.scoreLabel.isNotEmpty)
                  Expanded(
                    child: _ResultValue(
                      label: 'الدرجة',
                      value: measurement.scoreLabel,
                    ),
                  ),
                if (measurement.scoreLabel.isNotEmpty &&
                    measurement.percentageLabel.isNotEmpty)
                  const SizedBox(width: AppSpacing.md),
                if (measurement.percentageLabel.isNotEmpty)
                  Expanded(
                    child: _ResultValue(
                      label: 'النسبة',
                      value: measurement.percentageLabel,
                    ),
                  ),
              ],
            ),
          ],
          if (measurement.level.isNotEmpty || measurement.result.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              [measurement.level, measurement.result]
                  .where((value) => value.isNotEmpty)
                  .join(' • '),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ResultValue extends StatelessWidget {
  const _ResultValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

FlTitlesData _chartTitles(
  BuildContext context,
  List<StudentMeasurementItem> measurements,
) {
  final scheme = Theme.of(context).colorScheme;
  return FlTitlesData(
    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
    leftTitles: AxisTitles(
      sideTitles: SideTitles(
        showTitles: true,
        interval: 25,
        reservedSize: 38,
        getTitlesWidget: (value, meta) => Text(
          '${value.toInt()}%',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
      ),
    ),
    bottomTitles: AxisTitles(
      sideTitles: SideTitles(
        showTitles: true,
        interval: 1,
        reservedSize: 34,
        getTitlesWidget: (value, meta) {
          final index = value.round();
          if (index < 0 || index >= measurements.length) {
            return const SizedBox.shrink();
          }
          final item = measurements[index];
          final label = item.dateLabel;
          if (label.isEmpty) return const SizedBox.shrink();
          final parts = label.split('/');
          return SideTitleWidget(
            meta: meta,
            space: 8,
            child: Text(
              parts.length >= 2 ? '${parts[0]}/${parts[1]}' : label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
          );
        },
      ),
    ),
  );
}

bool _hasValidPercentage(StudentMeasurementItem item) {
  final value = item.percentage?.toDouble();
  return value != null && value.isFinite && value >= 0 && value <= 100;
}

bool _hasDatedPercentage(StudentMeasurementItem item) {
  return _hasValidPercentage(item) && (item.dateMs ?? 0) > 0;
}

String _measurementSubject(StudentMeasurementItem item) {
  return item.subject.isNotEmpty ? item.subject : item.subjectKey;
}

String _percent(double value) => '${value.toStringAsFixed(1)}%';
