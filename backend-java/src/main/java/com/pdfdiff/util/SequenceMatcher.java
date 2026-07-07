package com.pdfdiff.util;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.Chunk;
import com.github.difflib.patch.Patch;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 封装 java-diff-utils，提供字符/序列 diff 的 opcode 输出。 */
public final class SequenceMatcher {

    private SequenceMatcher() {}

    public record Opcode(String tag, int i1, int i2, int j1, int j2) {}

    private record TrimResult(String aMid, String bMid, int offset) {}

    /** 字符级 diff 入口：先裁剪相同前后缀，再 diff。 */
    public static List<Opcode> getOpcodes(String a, String b) {
        if ((a == null || a.isEmpty()) && (b == null || b.isEmpty())) {
            return List.of();
        }
        TrimResult trimmed = trimEqualAffixes(a == null ? "" : a, b == null ? "" : b);
        List<Opcode> opcodes = getOpcodes(toCharTokens(trimmed.aMid()), toCharTokens(trimmed.bMid()));
        return offsetOpcodes(opcodes, trimmed.offset(), trimmed.offset());
    }

    public static List<Opcode> getOpcodes(List<String> a, List<String> b) {
        if (a.isEmpty() && b.isEmpty()) {
            return List.of();
        }
        if (a.isEmpty()) {
            return List.of(new Opcode("insert", 0, 0, 0, b.size()));
        }
        if (b.isEmpty()) {
            return List.of(new Opcode("delete", 0, a.size(), 0, 0));
        }

        Patch<String> patch = DiffUtils.diff(a, b);
        List<Opcode> opcodes = new ArrayList<>();
        for (AbstractDelta<String> delta : patch.getDeltas()) {
            Chunk<String> source = delta.getSource();
            Chunk<String> target = delta.getTarget();
            int i1 = source.getPosition();
            int i2 = i1 + source.size();
            int j1 = target.getPosition();
            int j2 = j1 + target.size();
            String tag =
                    switch (delta.getType()) {
                        case DELETE -> "delete";
                        case INSERT -> "insert";
                        case CHANGE -> "replace";
                        case EQUAL -> "equal";
                    };
            opcodes.add(new Opcode(tag, i1, i2, j1, j2));
        }
        return opcodes;
    }

    public static List<Opcode> offsetOpcodes(List<Opcode> opcodes, int tplOff, int conOff) {
        if (opcodes.isEmpty()) {
            return opcodes;
        }
        List<Opcode> offset = new ArrayList<>(opcodes.size());
        for (Opcode op : opcodes) {
            offset.add(new Opcode(op.tag(), op.i1() + tplOff, op.i2() + tplOff, op.j1() + conOff, op.j2() + conOff));
        }
        return offset;
    }

    /** 去掉首尾相同字符，缩小 diff 范围 */
    private static TrimResult trimEqualAffixes(String a, String b) {
        int minLen = Math.min(a.length(), b.length());
        int start = 0;
        while (start < minLen && a.charAt(start) == b.charAt(start)) {
            start++;
        }

        int endA = a.length();
        int endB = b.length();
        while (endA > start && endB > start && a.charAt(endA - 1) == b.charAt(endB - 1)) {
            endA--;
            endB--;
        }

        return new TrimResult(a.substring(start, endA), b.substring(start, endB), start);
    }

    public static List<String> toCharTokens(String text) {
        if (text == null || text.isEmpty()) {
            return List.of();
        }
        List<String> tokens = new ArrayList<>();
        for (int index = 0; index < text.length(); ) {
            int codePoint = text.codePointAt(index);
            tokens.add(new String(Character.toChars(codePoint)));
            index += Character.charCount(codePoint);
        }
        return tokens;
    }

    /** 合并同一行内相邻或重叠的 bbox，用于字级高亮。 */
    public static List<double[]> mergeAdjacent(List<double[]> bboxes) {
        if (bboxes.isEmpty()) {
            return List.of();
        }

        List<double[]> sorted = new ArrayList<>(bboxes);
        sorted.sort(
                Comparator.comparingDouble((double[] box) -> box[1])
                        .thenComparingDouble(box -> box[0]));

        List<double[]> merged = new ArrayList<>();
        merged.add(sorted.get(0).clone());

        for (int i = 1; i < sorted.size(); i++) {
            double[] box = sorted.get(i);
            double[] last = merged.get(merged.size() - 1);
            double lastHeight = Math.max(last[3] - last[1], box[3] - box[1]);
            boolean sameRow = Math.abs(box[1] - last[1]) < Math.max(lastHeight, 1.0) * 0.5;
            boolean touching = box[0] <= last[2] + 2;

            if (sameRow && touching) {
                last[1] = Math.min(last[1], box[1]);
                last[2] = Math.max(last[2], box[2]);
                last[3] = Math.max(last[3], box[3]);
            } else {
                merged.add(box.clone());
            }
        }
        return merged;
    }
}
