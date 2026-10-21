import 'package:flutter/material.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../../../shared/widgets/app_section_title.dart';
import '../data/student_measurements_service.dart';
import '../models/student_measurement_item.dart';

class StudentMeasurementsTab extends StatefulWidget {
  const StudentMeasurementsTab({
    super.key,
    required this.studentId,
  });

  final String studentId;

  @override
  State<StudentMeasurementsTab> createState() => _StudentMeasurementsTabState();
}

class _StudentMeasurementsTabState extends State<StudentMeasurementsTab> {
  late Future<List<StudentMeasurementItem>> _future;

  final _service = StudentMeasurementsService();

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<StudentMeasurementItem>> _load() {
    return _service.loadStudentMeasurements(studentId: widget.studentId);
  }

  Future<void> _reload() async {
    setState(() {
      _future = _load();
    });
    await _future;
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
            onRetry: () {
              _reload();
            },
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

        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              const AppSectionTitle(
                title: 'القياسات',
                subtitle: 'النتائج المكتملة والمعتمدة فقط.',
                icon: Icons.analytics_rounded,
              ),
              const SizedBox(height: AppSpacing.md),
              ...measurements.map(
                (measurement) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: _MeasurementCard(measurement: measurement),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MeasurementCard extends StatelessWidget {
  const _MeasurementCard({required this.measurement});

  final StudentMeasurementItem measurement;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final details = <String>[
      if (measurement.subject.isNotEmpty) measurement.subject,
      if (measurement.dateLabel.isNotEmpty) measurement.dateLabel,
      if (measurement.isCompensation) 'قياس تعويضي',
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            measurement.displayTitle,
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              details.join(' • '),
              style: textTheme.bodySmall?.copyWith(
                color: AppColors.mutedText,
              ),
            ),
          ],
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
              [
                if (measurement.level.isNotEmpty) measurement.level,
                if (measurement.result.isNotEmpty) measurement.result,
              ].join(' • '),
              style: textTheme.bodyMedium?.copyWith(
                color: AppColors.mutedText,
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
    final textTheme = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.soft,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}
