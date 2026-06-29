package com.pdfdiff.util;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.Chunk;
import com.github.difflib.patch.Patch;

import java.util.ArrayList;
import java.util.List;

/**
 * 对齐 Python difflib.SequenceMatcher(..., autojunk=False).get_opcodes()。
 */
public final class SequenceMatcher {

    private SequenceMatcher() {
    }

    public record Opcode(String tag, int i1, int i2, int j1, int j2) {
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
            String tag = switch (delta.getType()) {
                case DELETE -> "delete";
                case INSERT -> "insert";
                case CHANGE -> "replace";
                case EQUAL -> "equal";
            };
            opcodes.add(new Opcode(tag, i1, i2, j1, j2));
        }
        return opcodes;
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
}
