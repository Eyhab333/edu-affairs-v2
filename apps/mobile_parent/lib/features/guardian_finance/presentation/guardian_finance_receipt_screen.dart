import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/theme/app_tokens.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_finance_service.dart';
import '../models/guardian_finance_overview.dart';

class GuardianFinanceReceiptScreen extends StatefulWidget {
  const GuardianFinanceReceiptScreen({
    required this.receiptId,
    super.key,
  });

  final String receiptId;

  @override
  State<GuardianFinanceReceiptScreen> createState() =>
      _GuardianFinanceReceiptScreenState();
}

class _GuardianFinanceReceiptScreenState
    extends State<GuardianFinanceReceiptScreen> {
  final _service = GuardianFinanceService();

  late Future<_ReceiptDetails> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadDetails();
  }

  Future<_ReceiptDetails> _loadDetails() async {
    final overview = await _service.loadMyOverview();

    GuardianFinanceReceipt? receipt;

    for (final item in overview.receipts) {
      if (item.id == widget.receiptId) {
        receipt = item;
        break;
      }
    }

    if (receipt == null) {
      throw StateError(
        'لم يتم العثور على الإيصال المطلوب.',
      );
    }

    GuardianFinancePayment? payment;

    for (final item in overview.payments) {
      if (item.id == receipt.paymentId) {
        payment = item;
        break;
      }
    }

    return _ReceiptDetails(
      receipt: receipt,
      payment: payment,
      children: overview.children,
    );
  }

  void _reload() {
    setState(() {
      _future = _loadDetails();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل الإيصال'),
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
        child: FutureBuilder<_ReceiptDetails>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState ==
                ConnectionState.waiting) {
              return const AppLoadingState(
                message: 'جاري تحميل الإيصال...',
              );
            }

            if (snapshot.hasError) {
              return AppErrorState(
                title: 'تعذر تحميل الإيصال',
                message: snapshot.error.toString(),
                onRetry: _reload,
              );
            }

            final details = snapshot.data;

            if (details == null) {
              return const Center(
                child: Text('الإيصال غير موجود.'),
              );
            }

            return _ReceiptBody(details: details);
          },
        ),
      ),
    );
  }
}

class _ReceiptDetails {
  const _ReceiptDetails({
    required this.receipt,
    required this.payment,
    required this.children,
  });

  final GuardianFinanceReceipt receipt;
  final GuardianFinancePayment? payment;
  final List<GuardianFinanceChild> children;

  String studentName(String studentId) {
    for (final child in children) {
      if (child.student.id == studentId) {
        return child.student.displayName;
      }
    }

    return studentId;
  }

  String chargeTitle(String chargeId) {
    for (final child in children) {
      for (final charge in child.charges) {
        if (charge.id == chargeId) {
          return charge.title;
        }
      }
    }

    return 'مستحق مالي';
  }
}

class _ReceiptBody extends StatelessWidget {
  const _ReceiptBody({
    required this.details,
  });

  final _ReceiptDetails details;

  @override
  Widget build(BuildContext context) {
    final receipt = details.receipt;
    final payment = details.payment;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _ReceiptHeader(receipt: receipt),
        const SizedBox(height: AppSpacing.lg),

        AppCard(
          child: Column(
            children: [
              _DetailRow(
                label: 'رقم الإيصال',
                value: receipt.receiptNumber,
              ),
              const Divider(),
              _DetailRow(
                label: 'قيمة الإيصال',
                value: _formatMoney(
                  receipt.amountMinor,
                  receipt.currency,
                ),
              ),
              const Divider(),
              _DetailRow(
                label: 'تاريخ الإصدار',
                value: _formatDate(receipt.issuedAt),
              ),
              const Divider(),
              _DetailRow(
                label: 'حالة الإيصال',
                value: _receiptStatusLabel(
                  receipt.status,
                ),
              ),
              if (payment != null) ...[
                const Divider(),
                _DetailRow(
                  label: 'وسيلة الدفع',
                  value: _paymentMethodLabel(
                    payment.paymentMethod,
                  ),
                ),
                const Divider(),
                _DetailRow(
                  label: 'حالة الدفعة',
                  value: _paymentStatusLabel(
                    payment.status,
                  ),
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: AppSpacing.lg),

        FilledButton.icon(
          onPressed: () async {
            await Clipboard.setData(
              ClipboardData(
                text: receipt.receiptNumber,
              ),
            );

            if (!context.mounted) return;

            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'تم نسخ رقم الإيصال',
                ),
              ),
            );
          },
          icon: const Icon(Icons.copy_rounded),
          label: const Text('نسخ رقم الإيصال'),
        ),

        if (payment != null &&
            payment.allocations.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),

          const _SectionTitle(
            icon: Icons.account_tree_outlined,
            title: 'توزيع الدفعة',
          ),
          const SizedBox(height: AppSpacing.sm),

          for (final allocation
              in payment.allocations) ...[
            AppCard(
              child: Row(
                children: [
                  const Icon(
                    Icons.check_circle_outline_rounded,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          details.chargeTitle(
                            allocation.chargeId,
                          ),
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          details.studentName(
                            allocation.studentId,
                          ),
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                color:
                                    AppColors.mutedText,
                              ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    _formatMoney(
                      allocation.amountMinor,
                      receipt.currency,
                    ),
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],

        if (receipt.status == 'CANCELLED' ||
            payment?.status == 'REVERSED') ...[
          const SizedBox(height: AppSpacing.lg),

          AppCard(
            child: Row(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.warning_amber_rounded,
                  color:
                      Theme.of(context).colorScheme.error,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'تم إلغاء هذا الإيصال',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (receipt.cancelReason.isNotEmpty)
                        Text(receipt.cancelReason)
                      else if (payment != null &&
                          payment
                              .reversalReason
                              .isNotEmpty)
                        Text(payment.reversalReason),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ReceiptHeader extends StatelessWidget {
  const _ReceiptHeader({
    required this.receipt,
  });

  final GuardianFinanceReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final cancelled = receipt.status == 'CANCELLED';

    return AppCard(
      child: Column(
        children: [
          CircleAvatar(
            radius: 32,
            backgroundColor:
                Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: 0.12),
            child: Icon(
              Icons.receipt_long_rounded,
              size: 34,
              color:
                  Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            receipt.receiptNumber,
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            _formatMoney(
              receipt.amountMinor,
              receipt.currency,
            ),
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _StatusBadge(
            text: cancelled ? 'ملغي' : 'صادر',
            positive: !cancelled,
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: AppColors.mutedText,
              ),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
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
        horizontal: 10,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(50),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
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
    return 'غير محدد';
  }

  final date =
      DateTime.fromMillisecondsSinceEpoch(value);

  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
}

String _receiptStatusLabel(String status) {
  const labels = {
    'ISSUED': 'صادر',
    'CANCELLED': 'ملغي',
  };

  return labels[status] ?? status;
}

String _paymentStatusLabel(String status) {
  const labels = {
    'POSTED': 'معتمدة',
    'REVERSED': 'معكوسة',
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