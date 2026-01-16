"""Comprehensive tests for string_utils module."""

import pytest

from string_utils import capitalize_words, reverse_string, count_vowels


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_sentences():
    """Provide common sample sentences for testing."""
    return {
        "simple": "hello world",
        "mixed_case": "HeLLo WoRLd",
        "with_numbers": "hello 123 world",
        "with_punctuation": "hello, world!",
        "multiline": "hello\nworld",
        "tabs": "hello\tworld",
    }


@pytest.fixture
def vowel_test_data():
    """Provide test data specifically for vowel counting."""
    return {
        "all_vowels_lower": "aeiou",
        "all_vowels_upper": "AEIOU",
        "all_vowels_mixed": "aEiOu",
        "no_vowels": "bcdfghjklmnpqrstvwxyz",
        "consonants_only": "rhythm",
    }


@pytest.fixture
def edge_case_strings():
    """Provide edge case strings for testing."""
    return {
        "empty": "",
        "single_char": "a",
        "single_consonant": "b",
        "whitespace_only": "   ",
        "newlines_only": "\n\n\n",
        "special_chars": "!@#$%^&*()",
        "unicode": "caf\u00e9",
        "emoji": "\U0001f600\U0001f604",
    }


# =============================================================================
# Tests for capitalize_words
# =============================================================================


class TestCapitalizeWords:
    """Tests for the capitalize_words function."""

    # Happy path tests
    def test_simple_sentence(self, sample_sentences):
        """Test capitalizing a simple lowercase sentence."""
        result = capitalize_words(sample_sentences["simple"])
        assert result == "Hello World"

    def test_mixed_case_sentence(self, sample_sentences):
        """Test capitalizing a mixed case sentence."""
        result = capitalize_words(sample_sentences["mixed_case"])
        assert result == "Hello World"

    def test_single_word(self):
        """Test capitalizing a single word."""
        assert capitalize_words("hello") == "Hello"

    def test_already_capitalized(self):
        """Test that already capitalized text is handled correctly."""
        assert capitalize_words("Hello World") == "Hello World"

    def test_all_uppercase(self):
        """Test converting all uppercase to title case."""
        assert capitalize_words("HELLO WORLD") == "Hello World"

    # Parametrized tests for various inputs
    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("hello", "Hello"),
            ("hello world", "Hello World"),
            ("HELLO WORLD", "Hello World"),
            ("hElLo WoRlD", "Hello World"),
            ("a b c", "A B C"),
            ("the quick brown fox", "The Quick Brown Fox"),
        ],
    )
    def test_capitalize_various_inputs(self, input_text, expected):
        """Test capitalize_words with various inputs."""
        assert capitalize_words(input_text) == expected

    # Edge cases
    def test_empty_string(self, edge_case_strings):
        """Test capitalizing an empty string."""
        assert capitalize_words(edge_case_strings["empty"]) == ""

    def test_single_character(self, edge_case_strings):
        """Test capitalizing a single character."""
        assert capitalize_words(edge_case_strings["single_char"]) == "A"

    def test_whitespace_only(self, edge_case_strings):
        """Test capitalizing whitespace only string."""
        result = capitalize_words(edge_case_strings["whitespace_only"])
        assert result == "   "

    def test_with_numbers(self, sample_sentences):
        """Test capitalizing text containing numbers."""
        result = capitalize_words(sample_sentences["with_numbers"])
        assert result == "Hello 123 World"

    def test_with_punctuation(self, sample_sentences):
        """Test capitalizing text with punctuation."""
        result = capitalize_words(sample_sentences["with_punctuation"])
        assert result == "Hello, World!"

    def test_multiline_text(self, sample_sentences):
        """Test capitalizing multiline text."""
        result = capitalize_words(sample_sentences["multiline"])
        assert result == "Hello\nWorld"

    def test_tabs_in_text(self, sample_sentences):
        """Test capitalizing text with tabs."""
        result = capitalize_words(sample_sentences["tabs"])
        assert result == "Hello\tWorld"

    def test_special_characters(self, edge_case_strings):
        """Test capitalizing special characters."""
        result = capitalize_words(edge_case_strings["special_chars"])
        assert result == "!@#$%^&*()"

    def test_unicode_characters(self, edge_case_strings):
        """Test capitalizing unicode characters."""
        result = capitalize_words(edge_case_strings["unicode"])
        assert result == "Caf\u00e9"

    def test_hyphenated_words(self):
        """Test capitalizing hyphenated words (title() behavior)."""
        result = capitalize_words("well-known fact")
        assert result == "Well-Known Fact"

    def test_apostrophes(self):
        """Test capitalizing words with apostrophes (title() behavior)."""
        result = capitalize_words("it's a test")
        assert result == "It'S A Test"

    def test_numbers_at_start(self):
        """Test capitalizing text starting with numbers."""
        result = capitalize_words("123abc")
        assert result == "123Abc"

    def test_consecutive_spaces(self):
        """Test capitalizing text with consecutive spaces."""
        result = capitalize_words("hello    world")
        assert result == "Hello    World"


# =============================================================================
# Tests for reverse_string
# =============================================================================


class TestReverseString:
    """Tests for the reverse_string function."""

    # Happy path tests
    def test_simple_word(self):
        """Test reversing a simple word."""
        assert reverse_string("hello") == "olleh"

    def test_sentence(self, sample_sentences):
        """Test reversing a simple sentence."""
        result = reverse_string(sample_sentences["simple"])
        assert result == "dlrow olleh"

    def test_palindrome(self):
        """Test reversing a palindrome."""
        assert reverse_string("radar") == "radar"

    # Parametrized tests
    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("a", "a"),
            ("ab", "ba"),
            ("abc", "cba"),
            ("abcd", "dcba"),
            ("12345", "54321"),
            ("!@#", "#@!"),
        ],
    )
    def test_reverse_various_lengths(self, input_text, expected):
        """Test reversing strings of various lengths."""
        assert reverse_string(input_text) == expected

    # Edge cases
    def test_empty_string(self, edge_case_strings):
        """Test reversing an empty string."""
        assert reverse_string(edge_case_strings["empty"]) == ""

    def test_single_character(self, edge_case_strings):
        """Test reversing a single character."""
        assert reverse_string(edge_case_strings["single_char"]) == "a"

    def test_whitespace_only(self, edge_case_strings):
        """Test reversing whitespace only string."""
        result = reverse_string(edge_case_strings["whitespace_only"])
        assert result == "   "

    def test_special_characters(self, edge_case_strings):
        """Test reversing special characters."""
        result = reverse_string(edge_case_strings["special_chars"])
        assert result == ")(*&^%$#@!"

    def test_unicode_characters(self, edge_case_strings):
        """Test reversing unicode characters."""
        result = reverse_string(edge_case_strings["unicode"])
        assert result == "\u00e9fac"

    def test_emoji(self, edge_case_strings):
        """Test reversing emoji characters."""
        result = reverse_string(edge_case_strings["emoji"])
        assert result == "\U0001f604\U0001f600"

    def test_multiline_text(self, sample_sentences):
        """Test reversing multiline text."""
        result = reverse_string(sample_sentences["multiline"])
        assert result == "dlrow\nolleh"

    def test_with_numbers(self, sample_sentences):
        """Test reversing text with numbers."""
        result = reverse_string(sample_sentences["with_numbers"])
        assert result == "dlrow 321 olleh"

    def test_mixed_case_preserved(self):
        """Test that case is preserved when reversing."""
        assert reverse_string("HeLLo") == "oLLeH"

    def test_very_long_string(self):
        """Test reversing a very long string."""
        long_string = "a" * 10000
        result = reverse_string(long_string)
        assert result == long_string
        assert len(result) == 10000

    def test_newlines_only(self, edge_case_strings):
        """Test reversing newlines only."""
        result = reverse_string(edge_case_strings["newlines_only"])
        assert result == "\n\n\n"


# =============================================================================
# Tests for count_vowels
# =============================================================================


class TestCountVowels:
    """Tests for the count_vowels function."""

    # Happy path tests
    def test_simple_word(self):
        """Test counting vowels in a simple word."""
        assert count_vowels("hello") == 2

    def test_sentence(self, sample_sentences):
        """Test counting vowels in a sentence."""
        result = count_vowels(sample_sentences["simple"])
        assert result == 3  # e, o, o

    def test_all_vowels_lowercase(self, vowel_test_data):
        """Test counting all lowercase vowels."""
        result = count_vowels(vowel_test_data["all_vowels_lower"])
        assert result == 5

    def test_all_vowels_uppercase(self, vowel_test_data):
        """Test counting all uppercase vowels."""
        result = count_vowels(vowel_test_data["all_vowels_upper"])
        assert result == 5

    def test_all_vowels_mixed_case(self, vowel_test_data):
        """Test counting mixed case vowels."""
        result = count_vowels(vowel_test_data["all_vowels_mixed"])
        assert result == 5

    def test_no_vowels(self, vowel_test_data):
        """Test string with no vowels."""
        result = count_vowels(vowel_test_data["no_vowels"])
        assert result == 0

    def test_consonants_only_word(self, vowel_test_data):
        """Test a word with only consonants."""
        result = count_vowels(vowel_test_data["consonants_only"])
        assert result == 0

    # Parametrized tests
    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("a", 1),
            ("e", 1),
            ("i", 1),
            ("o", 1),
            ("u", 1),
            ("A", 1),
            ("E", 1),
            ("I", 1),
            ("O", 1),
            ("U", 1),
            ("aeiouAEIOU", 10),
            ("bcdfg", 0),
            ("", 0),
        ],
    )
    def test_count_vowels_various(self, input_text, expected):
        """Test counting vowels with various inputs."""
        assert count_vowels(input_text) == expected

    @pytest.mark.parametrize(
        "input_text,expected",
        [
            ("The Quick Brown Fox", 5),  # e, u, i, o, o
            ("AAAAAA", 6),
            ("eeeeee", 6),
            ("Programming", 3),  # o, a, i
            ("Python", 1),  # o
            ("JavaScript", 3),  # a, a, i
        ],
    )
    def test_count_vowels_words(self, input_text, expected):
        """Test counting vowels in common words and phrases."""
        assert count_vowels(input_text) == expected

    # Edge cases
    def test_empty_string(self, edge_case_strings):
        """Test counting vowels in empty string."""
        assert count_vowels(edge_case_strings["empty"]) == 0

    def test_single_vowel(self, edge_case_strings):
        """Test counting a single vowel character."""
        assert count_vowels(edge_case_strings["single_char"]) == 1

    def test_single_consonant(self, edge_case_strings):
        """Test counting vowels in single consonant."""
        assert count_vowels(edge_case_strings["single_consonant"]) == 0

    def test_whitespace_only(self, edge_case_strings):
        """Test counting vowels in whitespace only string."""
        result = count_vowels(edge_case_strings["whitespace_only"])
        assert result == 0

    def test_special_characters(self, edge_case_strings):
        """Test counting vowels in special characters."""
        result = count_vowels(edge_case_strings["special_chars"])
        assert result == 0

    def test_numbers_only(self):
        """Test counting vowels in numbers only string."""
        assert count_vowels("12345") == 0

    def test_unicode_vowels(self, edge_case_strings):
        """Test counting vowels in unicode string."""
        # "café" has only 'a' as an ASCII vowel; 'é' is not in aeiouAEIOU
        result = count_vowels(edge_case_strings["unicode"])
        assert result == 1  # only 'a' is counted, not 'é'

    def test_with_numbers(self, sample_sentences):
        """Test counting vowels in text with numbers."""
        result = count_vowels(sample_sentences["with_numbers"])
        assert result == 3  # e, o, o

    def test_multiline_text(self, sample_sentences):
        """Test counting vowels in multiline text."""
        result = count_vowels(sample_sentences["multiline"])
        assert result == 3  # e, o, o

    def test_repeated_vowels(self):
        """Test counting repeated vowels."""
        assert count_vowels("aaaeeeiiioouuu") == 14

    def test_very_long_string_with_vowels(self):
        """Test counting vowels in a very long string."""
        long_string = "aeiou" * 1000
        result = count_vowels(long_string)
        assert result == 5000

    def test_mixed_content(self):
        """Test counting vowels in mixed content."""
        text = "Hello123!@#World456"
        result = count_vowels(text)
        assert result == 3  # e, o, o


# =============================================================================
# Integration/Combined Tests
# =============================================================================


class TestIntegration:
    """Integration tests combining multiple functions."""

    def test_reverse_then_count_vowels(self):
        """Test that vowel count is same before and after reversal."""
        text = "Hello World"
        original_count = count_vowels(text)
        reversed_text = reverse_string(text)
        reversed_count = count_vowels(reversed_text)
        assert original_count == reversed_count

    def test_capitalize_then_reverse(self):
        """Test capitalizing then reversing."""
        text = "hello world"
        capitalized = capitalize_words(text)
        reversed_text = reverse_string(capitalized)
        assert reversed_text == "dlroW olleH"

    def test_all_functions_on_empty(self):
        """Test all functions handle empty string consistently."""
        empty = ""
        assert capitalize_words(empty) == ""
        assert reverse_string(empty) == ""
        assert count_vowels(empty) == 0

    def test_all_functions_on_single_vowel(self):
        """Test all functions on a single vowel."""
        vowel = "a"
        assert capitalize_words(vowel) == "A"
        assert reverse_string(vowel) == "a"
        assert count_vowels(vowel) == 1

    def test_capitalize_preserves_vowel_count(self):
        """Test that capitalizing doesn't change vowel count."""
        text = "hello world"
        original_count = count_vowels(text)
        capitalized = capitalize_words(text)
        capitalized_count = count_vowels(capitalized)
        assert original_count == capitalized_count


# =============================================================================
# Property-based style tests
# =============================================================================


class TestProperties:
    """Property-based style tests."""

    @pytest.mark.parametrize(
        "text",
        [
            "hello",
            "Hello World",
            "UPPERCASE",
            "mixedCASE",
            "123abc",
            "   spaces   ",
            "",
        ],
    )
    def test_double_reverse_identity(self, text):
        """Test that reversing twice returns original string."""
        assert reverse_string(reverse_string(text)) == text

    @pytest.mark.parametrize(
        "text",
        [
            "hello",
            "Hello World",
            "AEIOU",
            "bcdfg",
            "12345",
            "",
        ],
    )
    def test_reverse_preserves_length(self, text):
        """Test that reversing preserves string length."""
        assert len(reverse_string(text)) == len(text)

    @pytest.mark.parametrize(
        "text",
        [
            "hello",
            "Hello World",
            "test string",
            "",
        ],
    )
    def test_capitalize_preserves_length(self, text):
        """Test that capitalizing preserves string length."""
        assert len(capitalize_words(text)) == len(text)

    @pytest.mark.parametrize(
        "text",
        [
            "hello",
            "Hello World",
            "UPPERCASE",
            "aeiouAEIOU",
            "",
        ],
    )
    def test_vowel_count_non_negative(self, text):
        """Test that vowel count is always non-negative."""
        assert count_vowels(text) >= 0

    @pytest.mark.parametrize(
        "text",
        [
            "hello",
            "Hello World",
            "test",
            "",
        ],
    )
    def test_vowel_count_at_most_length(self, text):
        """Test that vowel count never exceeds string length."""
        assert count_vowels(text) <= len(text)
