import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_finance_service.dart';
import '../models/guardian_finance_overview.dart';

class GuardianFinanceChildScreen extends StatefulWidget {
  const GuardianFinanceChildScreen({
    required this.studentId,
    super.key,
  });

  final String studentId;

  @override
  State<GuardianFinanceChildScreen> createState() =>
      _GuardianFinanceChildScreenState();
}

class _GuardianFinanceChildScreenState
    extends State<GuardianFinanceChildScreen> {
  final _service = GuardianFinanceService();

  late Future<GuardianFinanceChild> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadChild();
  }

  Future<GuardianFinanceChild> _loadChild() async {
    final overview = await _service.loadMyOverview();

    for (final child in overview.children) {
      if (child.student.id == widget.studentId) {
        return child;
      }
    }

    throw StateError(
      'لم يتم العثور على الملف المالي لهذا الطالب.',
    );
  }

  void _reload() {
    setState(() {
      _future = _loadChild();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل الرسوم'),
        leading: IconButton(
          tooltip: 'العودة',
          onPressed: () =>
              context.go('/guardian-finance'),
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
      body: SafeArea(
        child: FutureBuilder<GuardianFinanceChild>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState ==
                ConnectionState.waiting) {
              return const AppLoadingState(
                message: 'جاري تحميل تفاصيل الرسوم...',
              );
            }

            if (snapshot.hasError) {
              return AppErrorState(
                title: 'تعذر تحميل تفاصيل الرسوم',
                message: snapshot.error.toString(),
                onRetry: _reload,
              );
            }

            final child = snapshot.data;

            if (child == null) {
              return const Center(
                child: Text(
                  'لا توجد بيانات مالية للطالب.',
                ),
              );
            }

            return _ChildFinanceBody(child: child);
          },
        ),
      ),
    );
  }
}

class _ChildFinanceBody extends StatelessWidget {
  const _ChildFinanceBody({
    required this.child,
  });

  final GuardianFinanceChild child;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _StudentHeader(child: child),
        const SizedBox(height: AppSpacing.lg),

        _SummaryCard(summary: child.summary),
        const SizedBox(height: AppSpacing.xl),

        const _SectionTitle(
          icon: Icons.description_outlined,
          title: 'المستحقات',
        ),
        const SizedBox(height: AppSpacing.sm),

        if (child.charges.isEmpty)
          const AppCard(
            child: Text(
              'لا توجد مستحقات مالية مسجلة.',
              textAlign: TextAlign.center,
            ),
          )
        else
          for (final charge in child.charges) ...[
            _ChargeCard(charge: charge),
            const SizedBox(height: AppSpacing.sm),
          ],

        const SizedBox(height: AppSpacing.lg),

        const _SectionTitle(
          icon: Icons.calendar_month_rounded,
          title: 'الأقساط',
        ),
        const SizedBox(height: AppSpacing.sm),

        if (child.installments.isEmpty)
          const AppCard(
            child: Text(
              'لا توجد أقساط منفصلة لهذا الطالب.',
              textAlign: TextAlign.center,
            ),
          )
        else
          for (final installment
              in child.installments) ...[
            _InstallmentCard(
              installment: installment,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
      ],
    );
  }
}

class _StudentHeader extends StatelessWidget {
  const _StudentHeader({
    required this.child,
  });

  final GuardianFinanceChild child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enrollment = child.enrollment;

    return AppCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 27,
            backgroundColor:
                theme.colorScheme.primary.withValues(
              alpha: 0.12,
            ),
            child: Icon(
              Icons.person_rounded,
              color: theme.colorScheme.primary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  child.student.displayName,
                  style:
                      theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  enrollment == null
                      ? 'لا توجد بيانات تسجيل نشطة'
                      : [
                          enrollment.gradeId,
                          enrollment.classId,
                        ].where(
                          (value) => value.isNotEmpty,
                        ).join(' • '),
                  style:
                      theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.mutedText,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.summary,
  });

  final GuardianFinanceSummary summary;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'الملخص المالي',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _SummaryItem(
                  label: 'المستحق',
                  value: _formatMoney(
                    summary.totalAmountMinor,
                    summary.currency,
                  ),
                ),
              ),
              Expanded(
                child: _SummaryItem(
                  label: 'المسدد',
                  value: _formatMoney(
                    summary.paidAmountMinor,
                    summary.currency,
                  ),
                ),
              ),
              Expanded(
                child: _SummaryItem(
                  label: 'المتبقي',
                  value: _formatMoney(
                    summary.balanceAmountMinor,
                    summary.currency,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(
                color: AppColors.mutedText,
              ),
        ),
        const SizedBox(height: 5),
        Text(
          value,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _ChargeCard extends StatelessWidget {
  const _ChargeCard({
    required this.charge,
  });

  final GuardianFinanceCharge charge;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.request_quote_outlined),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  charge.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              _StatusBadge(
                text: _chargeStatusLabel(
                  charge.status,
                ),
                positive:
                    charge.balanceAmountMinor == 0,
              ),
            ],
          ),

          if (charge.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              charge.description,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(
                    color: AppColors.mutedText,
                  ),
            ),
          ],

          const Divider(height: AppSpacing.xl),

          _MoneyRow(
            label: 'قيمة المستحق',
            amountMinor: charge.netAmountMinor,
            currency: charge.currency,
          ),
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: 'المسدد',
            amountMinor: charge.paidAmountMinor,
            currency: charge.currency,
          ),
          const SizedBox(height: AppSpacing.sm),
          _MoneyRow(
            label: 'المتبقي',
            amountMinor: charge.balanceAmountMinor,
            currency: charge.currency,
            emphasized: true,
          ),

          if (charge.dueAt != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              'تاريخ الاستحقاق: ${_formatDate(charge.dueAt)}',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(
                    color: AppColors.mutedText,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InstallmentCard extends StatelessWidget {
  const _InstallmentCard({
    required this.installment,
  });

  final GuardianFinanceInstallment installment;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          CircleAvatar(
            child: Text(
              installment.sequence > 0
                  ? '${installment.sequence}'
                  : '-',
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  installment.title.isEmpty
                      ? 'قسط مالي'
                      : installment.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  _formatDate(installment.dueAt),
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(
                        color: AppColors.mutedText,
                      ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatMoney(
                  installment.balanceAmountMinor,
                  installment.currency,
                ),
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                ),
              ),
              _StatusBadge(
                text: _installmentStatusLabel(
                  installment.status,
                ),
                positive:
                    installment.balanceAmountMinor == 0,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
    required this.label,
    required this.amountMinor,
    required this.currency,
    this.emphasized = false,
  });

  final String label;
  final int amountMinor;
  final String currency;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          _formatMoney(amountMinor, currency),
          style: TextStyle(
            fontWeight: emphasized
                ? FontWeight.w900
                : FontWeight.w700,
            color: emphasized
                ? Theme.of(context).colorScheme.primary
                : null,
          ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.text,
    required this.positive,
  });

  final String text;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final color = positive
        ? Colors.green
        : Theme.of(context).colorScheme.error;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(50),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.icon,
    required this.title,
  });

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          icon,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          title,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(
                fontWeight: FontWeight.w900,
              ),
        ),
      ],
    );
  }
}

String _formatMoney(
  int amountMinor,
  String currency,
) {
  final amount = amountMinor / 100;

  return '${amount.toStringAsFixed(2)} ${currency == 'SAR' ? 'ر.س' : currency}';
}

String _formatDate(int? value) {
  if (value == null || value <= 0) {
    return 'تاريخ غير محدد';
  }

  final date = DateTime.fromMillisecondsSinceEpoch(
    value,
  );

  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
}

String _chargeStatusLabel(String status) {
  const labels = {
    'ACTIVE': 'مستحق',
    'PARTIALLY_PAID': 'مسدد جزئيًا',
    'PAID': 'مسدد',
    'OVERDUE': 'متأخر',
    'WAIVED': 'معفى',
  };

  return labels[status] ?? status;
}

String _installmentStatusLabel(String status) {
  const labels = {
    'PENDING': 'مستحق',
    'PARTIALLY_PAID': 'جزئي',
    'PAID': 'مسدد',
    'OVERDUE': 'متأخر',
    'WAIVED': 'معفى',
    'CANCELLED': 'ملغي',
  };

  return labels[status] ?? status;
}