package com.pdfdiff.service.impl;

import com.pdfdiff.service.NormalizeService;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Service
public class NormalizeServiceImpl implements NormalizeService {

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    @Override
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
