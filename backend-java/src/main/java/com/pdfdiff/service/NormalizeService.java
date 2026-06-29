package com.pdfdiff.service;

import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Service
public class NormalizeService {

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    public String normalize(String text, boolean ignoreWhitespace) {
        if (text == null || text.isEmpty()) {
            return "";
        }

        String result = text.strip();
        if (ignoreWhitespace) {
            result = WHITESPACE.matcher(result).replaceAll("");
        }

        result = result
                .replace('，', ',')
                .replace('。', '.')
                .replace('；', ';')
                .replace('（', '(')
                .replace('）', ')')
                .replace('：', ':');
        return result;
    }
}
