import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_finance_service.dart';
import '../models/guardian_finance_overview.dart';

class GuardianFinanceScreen extends StatefulWidget {
  const GuardianFinanceScreen({super.key});

  @override
  State<GuardianFinanceScreen> createState() => _GuardianFinanceScreenState();
}

class _GuardianFinanceScreenState extends State<GuardianFinanceScreen> {
  final _service = GuardianFinanceService();

  late Future<GuardianFinanceOverview> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.loadMyOverview();
  }

  void _reload() {
    setState(() {
      _future = _service.loadMyOverview();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الرسوم والمدفوعات'),
        leading: IconButton(
          tooltip: 'العودة',
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
      body: SafeArea(
        child: FutureBuilder<GuardianFinanceOverview>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const AppLoadingState(
                message: 'جاري تحميل الملف المالي...',
              );
            }

            if (snapshot.hasError) {
              return AppErrorState(
                title: 'تعذر تحميل الرسوم والمدفوعات',
                message: snapshot.error.toString(),
                onRetry: _reload,
              );
            }

            final overview = snapshot.data;

            if (overview == null) {
              return const AppEmptyState(
                icon: Icons.account_balance_wallet_outlined,
                title: 'لا توجد بيانات مالية',
                message: 'لا توجد رسوم أو مدفوعات مرتبطة بحسابك حاليًا.',
              );
            }

            return _FinanceBody(overview: overview);
          },
        ),
      ),
    );
  }
}

class _FinanceBody extends StatelessWidget {
  const _FinanceBody({required this.overview});

  final GuardianFinanceOverview overview;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _GuardianHeader(displayName: overview.guardian.displayName),
          const SizedBox(height: AppSpacing.lg),

          _SummaryCard(summary: overview.summary),
          const SizedBox(height: AppSpacing.xl),

          _SectionTitle(
            icon: Icons.child_care_rounded,
            title: 'رسوم الأبناء',
            subtitle: '${overview.children.length} طالب مرتبط بحسابك',
          ),
          const SizedBox(height: AppSpacing.sm),

          if (overview.children.isEmpty)
            const AppCard(
              child: Text(
                'لا يوجد أبناء مرتبطون بالملف المالي.',
                textAlign: TextAlign.center,
              ),
            )
          else
            for (final child in overview.children) ...[
              _ChildFinanceCard(
                child: child,
                onTap: () => context.go(
                  '/guardian-finance/children/${child.student.id}',
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],

          const SizedBox(height: AppSpacing.md),

          _SectionTitle(
            icon: Icons.payments_rounded,
            title: 'آخر الدفعات',
            subtitle: '${overview.payments.length} دفعة مسجلة',
          ),
          const SizedBox(height: AppSpacing.sm),

          if (overview.payments.isEmpty)
            const AppCard(
              child: Text(
                'لا توجد دفعات مسجلة حتى الآن.',
                textAlign: TextAlign.center,
              ),
            )
          else
            for (final payment in overview.payments) ...[
              _PaymentCard(payment: payment),
              const SizedBox(height: AppSpacing.sm),
            ],

          const SizedBox(height: AppSpacing.lg),

          _SectionTitle(
            icon: Icons.receipt_long_rounded,
            title: 'الإيصالات',
            subtitle: '${overview.receipts.length} إيصال',
          ),
          const SizedBox(height: AppSpacing.sm),

          if (overview.receipts.isEmpty)
            const AppCard(
              child: Text(
                'لا توجد إيصالات متاحة.',
                textAlign: TextAlign.center,
              ),
            )
          else
            for (final receipt in overview.receipts) ...[
              _ReceiptCard(
                receipt: receipt,
                onTap: () =>
                    context.go('/guardian-finance/receipts/${receipt.id}'),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
        ],
      ),
    );
  }
}

class _GuardianHeader extends StatelessWidget {
  const _GuardianHeader({required this.displayName});

  final String displayName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.xl),
            ),
            child: Icon(
              Icons.account_balance_wallet_rounded,
              color: theme.colorScheme.primary,
              size: 30,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  displayName,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'الملف المالي للأسرة',
                  style: theme.textTheme.bodySmall?.copyWith(
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
  const _SummaryCard({required this.summary});

  final GuardianFinanceSummary summary;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'الملخص المالي',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _AmountItem(
                  label: 'إجمالي المستحق',
                  value: _formatMoney(
                    summary.totalAmountMinor,
                    summary.currency,
                  ),
                  icon: Icons.request_quote_rounded,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _AmountItem(
                  label: 'المسدد',
                  value: _formatMoney(
                    summary.paidAmountMinor,
                    summary.currency,
                  ),
                  icon: Icons.check_circle_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _AmountItem(
                  label: 'المتبقي',
                  value: _formatMoney(
                    summary.balanceAmountMinor,
                    summary.currency,
                  ),
                  icon: Icons.account_balance_wallet_rounded,
                  emphasized: true,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _AmountItem(
                  label: 'متأخر',
                  value: _formatMoney(
                    summary.overdueAmountMinor,
                    summary.currency,
                  ),
                  icon: Icons.warning_amber_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AmountItem extends StatelessWidget {
  const _AmountItem({
    required this.label,
    required this.value,
    required this.icon,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: emphasized
            ? theme.colorScheme.primary.withValues(alpha: 0.1)
            : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: theme.colorScheme.primary),
          const SizedBox(height: AppSpacing.sm),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.mutedText,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChildFinanceCard extends StatelessWidget {
  const _ChildFinanceCard({required this.child, required this.onTap});

  final GuardianFinanceChild child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.xl),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: theme.colorScheme.primary.withValues(
                    alpha: 0.12,
                  ),
                  child: Icon(
                    Icons.person_rounded,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        child.student.displayName,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (child.enrollment != null)
                        Text(
                          child.enrollment!.classId.isNotEmpty
                              ? child.enrollment!.classId
                              : child.enrollment!.gradeId,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.mutedText,
                          ),
                        ),
                    ],
                  ),
                ),
                _StatusBadge(
                  text: child.summary.balanceAmountMinor > 0
                      ? 'يوجد متبقي'
                      : 'مسدد',
                  positive: child.summary.balanceAmountMinor == 0,
                ),
                const SizedBox(width: AppSpacing.sm),
                const Icon(Icons.chevron_left_rounded),
              ],
            ),
            const SizedBox(height: AppSpacing.md),

            Row(
              children: [
                Expanded(
                  child: _CompactAmount(
                    label: 'المستحق',
                    value: _formatMoney(
                      child.summary.totalAmountMinor,
                      child.summary.currency,
                    ),
                  ),
                ),
                Expanded(
                  child: _CompactAmount(
                    label: 'المسدد',
                    value: _formatMoney(
                      child.summary.paidAmountMinor,
                      child.summary.currency,
                    ),
                  ),
                ),
                Expanded(
                  child: _CompactAmount(
                    label: 'المتبقي',
                    value: _formatMoney(
                      child.summary.balanceAmountMinor,
                      child.summary.currency,
                    ),
                  ),
                ),
              ],
            ),

            if (child.charges.isNotEmpty) ...[
              const Divider(height: AppSpacing.xl),

              for (final charge in child.charges) ...[
                _ChargeRow(charge: charge),
                if (charge != child.charges.last) const Divider(),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _CompactAmount extends StatelessWidget {
  const _CompactAmount({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w900),
        ),
      ],
    );
  }
}

class _ChargeRow extends StatelessWidget {
  const _ChargeRow({required this.charge});

  final GuardianFinanceCharge charge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          const Icon(Icons.description_outlined, size: 20),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  charge.title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  _chargeStatusLabel(charge.status),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
                ),
              ],
            ),
          ),
          Text(
            _formatMoney(charge.balanceAmountMinor, charge.currency),
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.payment});

  final GuardianFinancePayment payment;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          const Icon(Icons.payments_outlined),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payment.receiptNumber.isEmpty
                      ? 'دفعة مالية'
                      : payment.receiptNumber,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  '${_paymentMethodLabel(payment.paymentMethod)} • ${_formatDate(payment.paidAt ?? payment.postedAt)}',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatMoney(payment.amountMinor, payment.currency),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              _StatusBadge(
                text: payment.status == 'REVERSED' ? 'معكوسة' : 'معتمدة',
                positive: payment.status != 'REVERSED',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({required this.receipt, required this.onTap});

  final GuardianFinanceReceipt receipt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.xl),
      child: AppCard(
        child: Row(
          children: [
            const Icon(Icons.receipt_long_rounded),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    receipt.receiptNumber,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  Text(
                    _formatDate(receipt.issuedAt),
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: AppColors.mutedText),
                  ),
                ],
              ),
            ),
            Text(
              _formatMoney(receipt.amountMinor, receipt.currency),
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),

            const SizedBox(width: AppSpacing.sm),
            const Icon(Icons.chevron_left_rounded),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.text, required this.positive});

  final String text;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final color = positive ? Colors.green : Theme.of(context).colorScheme.error;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: theme.colorScheme.primary),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.mutedText,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

String _formatMoney(int amountMinor, String currency) {
  final amount = amountMinor / 100;

  return '${amount.toStringAsFixed(2)} ${currency == 'SAR' ? 'ر.س' : currency}';
}

String _formatDate(int? value) {
  if (value == null || value <= 0) {
    return 'غير محدد';
  }

  final date = DateTime.fromMillisecondsSinceEpoch(value);

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

String _paymentMethodLabel(String method) {
  const labels = {
    'CASH': 'نقدي',
    'BANK_TRANSFER': 'تحويل بنكي',
    'CARD': 'شبكة / بطاقة',
    'CHEQUE': 'شيك',
    'ONLINE': 'دفع إلكتروني',
    'OTHER': 'أخرى',
  };

  return labels[method] ?? method;
}
