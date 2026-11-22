import 'package:flutter/material.dart';

import '../../../shared/widgets/app_empty_state.dart';
import '../../../shared/widgets/app_error_state.dart';
import '../../../shared/widgets/app_loading_state.dart';
import '../data/guardian_homework_service.dart';

class GuardianHomeworkTab extends StatefulWidget {
  const GuardianHomeworkTab({super.key, required this.studentId});
  final String studentId;

  @override
  State<GuardianHomeworkTab> createState() => _GuardianHomeworkTabState();
}

class _GuardianHomeworkTabState extends State<GuardianHomeworkTab> {
  final _service = GuardianHomeworkService();
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.list(widget.studentId);
  }

  @override
  void didUpdateWidget(covariant GuardianHomeworkTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.studentId != widget.studentId)
      _future = _service.list(widget.studentId);
  }

  Future<void> _refresh() async {
    final next = _service.list(widget.studentId);
    setState(() => _future = next);
    try {
      await next;
    } catch (_) {
      /* Displayed by FutureBuilder. */
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => FutureBuilder<List<Map<String, dynamic>>>(
    future: _future,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done)
        return const AppLoadingState(message: 'جارٍ تحميل الواجبات...');
      if (snapshot.hasError)
        return AppErrorState(
          title: 'تعذر تحميل الواجبات',
          message: snapshot.error.toString(),
          onRetry: _refresh,
        );
      final items = snapshot.data ?? [];
      if (items.isEmpty)
        return AppEmptyState(
          icon: Icons.menu_book_outlined,
          title: 'لا توجد واجبات',
          message: 'ستظهر الواجبات المنشورة هنا.',
          action: TextButton(onPressed: _refresh, child: const Text('تحديث')),
        );
      final pending = items.where((item) => !_completed(item)).toList()
        ..sort((a, b) => _due(a).compareTo(_due(b)));
      final previous = items.where(_completed).toList()
        ..sort((a, b) => _due(b).compareTo(_due(a)));
      final graded = items.where((item) => item['status'] == 'GRADED').length;
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(label: Text('المطلوبة: ${pending.length}')),
                Chip(label: Text('المسلّمة: ${previous.length}')),
                Chip(label: Text('المصححة: $graded')),
              ],
            ),
            _section('الواجبات المطلوبة', pending),
            _section('الواجبات السابقة', previous),
          ],
        ),
      );
    },
  );

  Widget _section(String title, List<Map<String, dynamic>> items) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(title, style: Theme.of(context).textTheme.titleMedium),
      ),
      if (items.isEmpty)
        const Padding(
          padding: EdgeInsets.all(8),
          child: Text('لا توجد واجبات في هذا القسم.'),
        ),
      for (final item in items)
        Card(
          child: ListTile(
            title: Text('${item['title'] ?? ''}'),
            subtitle: Text(
              [
                '${item['subject'] ?? ''}',
                if ('${item['description'] ?? ''}'.isNotEmpty)
                  '${item['description']}',
                'النشر: ${_date(item['publishedAt'])}   التسليم: ${_date(item['dueAt'])}',
                _status(item),
                if (item['status'] == 'GRADED' && item['score'] != null)
                  'الدرجة: ${item['score']} / ${item['maxScore']}',
              ].join('\n'),
            ),
            isThreeLine: true,
            trailing: const Icon(Icons.chevron_left),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => _HomeworkDetails(
                    studentId: widget.studentId,
                    submissionId: '${item['submissionId']}',
                    service: _service,
                  ),
                ),
              );
              if (mounted) await _refresh();
            },
          ),
        ),
    ],
  );
}

bool _completed(Map<String, dynamic> item) =>
    ['SUBMITTED', 'LATE_SUBMITTED', 'GRADED'].contains(item['status']);
int _due(Map<String, dynamic> item) =>
    item['dueAt'] is num ? (item['dueAt'] as num).toInt() : 9007199254740991;
String _date(dynamic timestamp) {
  if (timestamp is! num || timestamp <= 0) return 'غير محدد';
  final date = DateTime.fromMillisecondsSinceEpoch(timestamp.toInt()).toLocal();
  return '${date.year}/${date.month}/${date.day}';
}

String _status(Map<String, dynamic> item) {
  final status = item['status'];
  if (status == 'GRADED') return 'تم التصحيح';
  if (status == 'SUBMITTED') return 'تم التسليم';
  if (status == 'LATE_SUBMITTED') return 'تم التسليم متأخراً';
  if (status == 'RETURNED') return 'معاد للتعديل';
  final due = _due(item), now = DateTime.now().millisecondsSinceEpoch;
  if (due < now) return 'متأخر';
  if (due - now <= const Duration(days: 1).inMilliseconds)
    return 'يستحق قريباً';
  return status == 'IN_PROGRESS' ? 'قيد الحل' : 'لم يبدأ';
}

class _HomeworkDetails extends StatefulWidget {
  const _HomeworkDetails({
    required this.studentId,
    required this.submissionId,
    required this.service,
  });
  final String studentId, submissionId;
  final GuardianHomeworkService service;
  @override
  State<_HomeworkDetails> createState() => _HomeworkDetailsState();
}

class _HomeworkDetailsState extends State<_HomeworkDetails> {
  Map<String, dynamic>? _data;
  Object? _error;
  bool _busy = false;
  final Map<String, Map<String, dynamic>> _answers = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.service.details(
        widget.studentId,
        widget.submissionId,
      );
      if (!mounted) return;
      final answers = data['answers'];
      if (answers is List) {
        for (final raw in answers.whereType<Map>()) {
          final item = Map<String, dynamic>.from(raw);
          _answers['${item['questionId']}'] = item;
        }
      }
      setState(() {
        _data = data;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  Future<void> _save(bool submit) async {
    if (submit) {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('تأكيد التسليم'),
          content: const Text(
            'بعد التسليم لن تتمكن من تعديل الإجابات إلا إذا أعادها المعلم.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('تسليم'),
            ),
          ],
        ),
      );
      if (confirm != true || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      await widget.service.save(
        widget.studentId,
        widget.submissionId,
        _answers.values.toList(),
        submit: submit,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(submit ? 'تم تسليم الواجب' : 'تم حفظ المسودة')),
      );
      if (submit) {
        await _load();
      }
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'تعذر الحفظ. تأكد من الإجابات والاتصال ثم حاول مجدداً.',
            ),
          ),
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: Text(data == null ? 'الواجب' : '${data['title']}')),
      body: data == null
          ? _error == null
                ? const AppLoadingState(message: 'جارٍ تحميل الواجب...')
                : AppErrorState(
                    title: 'تعذر تحميل الواجب',
                    message: _error.toString(),
                    onRetry: _load,
                  )
          : _body(data),
    );
  }

  Widget _body(Map<String, dynamic> data) {
    final questions =
        (data['questions'] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
          ..sort(
            (a, b) => ((a['order'] as num?) ?? 0).compareTo(
              (b['order'] as num?) ?? 0,
            ),
          );
    final editable =
        data['assignmentStatus'] == 'PUBLISHED' &&
        ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].contains(data['status']);
    final answered = questions.where((question) {
      final answer = _answers['${question['id']}'];
      return answer != null &&
          ((answer['selectedChoiceIds'] is List &&
                  (answer['selectedChoiceIds'] as List).isNotEmpty) ||
              answer['booleanAnswer'] is bool ||
              '${answer['answerText'] ?? ''}'.trim().isNotEmpty);
    }).length;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('${data['description'] ?? ''}'),
        Text('التقدم: $answered / ${questions.length}'),
        Text('التسليم: ${_date(data['dueAt'])} • ${_status(data)}'),
        if (data['status'] == 'GRADED' && data['score'] != null)
          Text('الدرجة: ${data['score']} / ${data['maxScore']}'),
        if ('${data['feedback'] ?? ''}'.isNotEmpty)
          Text('ملاحظات المعلم: ${data['feedback']}'),
        for (var i = 0; i < questions.length; i++)
          _question(questions[i], i + 1, editable && !_busy),
        if (editable)
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => _save(false),
                  child: const Text('حفظ المسودة'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed:
                      _busy || answered != questions.length || questions.isEmpty
                      ? null
                      : () => _save(true),
                  child: const Text('تسليم الواجب'),
                ),
              ),
            ],
          ),
        if (!editable) const Text('الواجب للعرض فقط.'),
      ],
    );
  }

  Widget _question(Map<String, dynamic> question, int number, bool editable) {
    final questionId = '${question['id']}';
    final answer = _answers.putIfAbsent(
      questionId,
      () => {
        'questionId': questionId,
        'selectedChoiceIds': <String>[],
        'answerText': '',
        'booleanAnswer': null,
      },
    );
    final type = question['questionType'];
    final choices =
        (question['choices'] as List)
            .whereType<Map>()
            .map((choice) => Map<String, dynamic>.from(choice))
            .toList()
          ..sort(
            (a, b) => ((a['order'] as num?) ?? 0).compareTo(
              (b['order'] as num?) ?? 0,
            ),
          );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '$number. ${question['prompt']}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (type == 'MULTIPLE_CHOICE')
              ...choices.map((choice) {
                final selected = List<String>.from(
                  answer['selectedChoiceIds'] as List? ?? [],
                );
                final choiceId = '${choice['id']}';
                return CheckboxListTile(
                  value: selected.contains(choiceId),
                  title: Text('${choice['text']}'),
                  onChanged: editable
                      ? (value) => setState(() {
                          if (value == true) {
                            selected.add(choiceId);
                          } else {
                            selected.remove(choiceId);
                          }
                          answer['selectedChoiceIds'] = selected;
                        })
                      : null,
                );
              }),
            if (type == 'TRUE_FALSE')
              ...[true, false].map(
                (value) => RadioListTile<bool>(
                  value: value,
                  groupValue: answer['booleanAnswer'] as bool?,
                  title: Text(value ? 'صح' : 'خطأ'),
                  onChanged: editable
                      ? (selected) =>
                            setState(() => answer['booleanAnswer'] = selected)
                      : null,
                ),
              ),
            if (type == 'SHORT_ANSWER')
              TextFormField(
                initialValue: '${answer['answerText'] ?? ''}',
                enabled: editable,
                maxLength: 10000,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'الإجابة'),
                onChanged: (value) =>
                    setState(() => answer['answerText'] = value),
              ),
            if ('${answer['feedback'] ?? ''}'.isNotEmpty)
              Text('ملاحظة المعلم: ${answer['feedback']}'),
          ],
        ),
      ),
    );
  }
}
